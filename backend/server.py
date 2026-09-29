from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import logging
import uuid
import bcrypt
import jwt
import httpx
import asyncio
import random
import hmac
from datetime import datetime, timezone, timedelta, date
from typing import List, Optional, Literal
from html import escape

from fastapi import FastAPI, APIRouter, Request, Response, HTTPException, Depends, Query, BackgroundTasks, Header
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from pydantic import BaseModel, Field, EmailStr

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"

EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "PROPERLEAD")
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("properlead")

app = FastAPI(title="PROPERLEAD API")
api_router = APIRouter(prefix="/api")

# ---------------------------------------------------------------------------
# Constants / domain config
# ---------------------------------------------------------------------------
CRM_STAGES = ["NEW", "DIHUBUNGI", "RESPON", "MEETING", "PROPOSAL", "KERJASAMA"]

DEFAULT_REGIONS = [
    {"name": "Banjarmasin", "target": True},
    {"name": "Banjarbaru", "target": True},
    {"name": "Kabupaten Banjar", "target": True},
    {"name": "Tanah Laut", "target": True},
    {"name": "Barito Kuala", "target": False},
    {"name": "Tapin", "target": False},
]
DEFAULT_PROJECT_TYPES = [
    {"name": "Perumahan", "enabled": True},
    {"name": "Cluster", "enabled": True},
    {"name": "Kawasan Residential", "enabled": True},
    {"name": "Apartemen", "enabled": False},
    {"name": "Komersial", "enabled": False},
]


def now_utc():
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "type": "access",
               "exp": now_utc() + timedelta(hours=12)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "type": "refresh", "exp": now_utc() + timedelta(days=7)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access: str, refresh: str):
    response.set_cookie("access_token", access, httponly=True, secure=True,
                        samesite="lax", max_age=43200, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True,
                        samesite="lax", max_age=604800, path="/")


def clean_user(u: dict) -> dict:
    u = dict(u)
    u["id"] = str(u.pop("_id"))
    u.pop("password_hash", None)
    return u


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Belum terautentikasi")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Tipe token tidak valid")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User tidak ditemukan")
        if not user.get("active", True):
            raise HTTPException(status_code=403, detail="Akun dinonaktifkan")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token kadaluarsa")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token tidak valid")


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Hanya Super Admin")
    return user


# ---------------------------------------------------------------------------
# Lead scoring
# ---------------------------------------------------------------------------
def compute_score(lead: dict) -> dict:
    breakdown = []
    total = 0
    perizinan = lead.get("perizinan", {})
    if perizinan.get("status") == "Terbit":
        total += 40
        breakdown.append({"faktor": "KKPR/PKKPR terbit", "skor": 40})
    else:
        breakdown.append({"faktor": "KKPR/PKKPR terbit", "skor": 0})

    jenis = (lead.get("proyek", {}).get("jenis") or "").lower()
    if any(k in jenis for k in ["perumahan", "cluster", "residential", "real estat"]):
        total += 20
        breakdown.append({"faktor": "Kegiatan real estat/perumahan", "skor": 20})
    else:
        breakdown.append({"faktor": "Kegiatan real estat/perumahan", "skor": 0})

    if lead.get("lokasi_target"):
        total += 15
        breakdown.append({"faktor": "Lokasi sesuai wilayah target", "skor": 15})
    else:
        breakdown.append({"faktor": "Lokasi sesuai wilayah target", "skor": 0})

    dev = lead.get("developer", {})
    if dev.get("nama") and (dev.get("nib") or dev.get("alamat")):
        total += 15
        breakdown.append({"faktor": "Data developer tersedia", "skor": 15})
    else:
        breakdown.append({"faktor": "Data developer tersedia", "skor": 0})

    if lead.get("tata_ruang", {}).get("rdtr"):
        total += 10
        breakdown.append({"faktor": "RDTR tersedia", "skor": 10})
    else:
        breakdown.append({"faktor": "RDTR tersedia", "skor": 0})

    if total >= 80:
        prioritas = "A"
    elif total >= 60:
        prioritas = "B"
    else:
        prioritas = "C"
    return {"score": total, "prioritas": prioritas, "breakdown": breakdown}


def serialize_lead(doc: dict) -> dict:
    doc = dict(doc)
    doc.pop("_id", None)
    return doc


# ---------------------------------------------------------------------------
# Pydantic request models
# ---------------------------------------------------------------------------
class LoginReq(BaseModel):
    email: EmailStr
    password: str


class UserCreateReq(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Literal["super_admin", "user"] = "user"
    regions: List[str] = []


class UserUpdateReq(BaseModel):
    name: Optional[str] = None
    role: Optional[Literal["super_admin", "user"]] = None
    active: Optional[bool] = None
    regions: Optional[List[str]] = None
    password: Optional[str] = None


class DeveloperModel(BaseModel):
    nama: str
    nib: Optional[str] = None
    alamat: Optional[str] = None
    kontak: Optional[str] = None


class ProyekModel(BaseModel):
    nama: str
    jenis: str = "Perumahan"
    lokasi: Optional[str] = None
    kabupaten_kota: str
    kecamatan: Optional[str] = None
    luas_ha: Optional[float] = None
    koordinat: Optional[str] = None


class TataRuangModel(BaseModel):
    rdtr: Optional[str] = None
    zona: Optional[str] = None
    ketentuan_zonasi: Optional[str] = None


class PerizinanModel(BaseModel):
    jenis_kkpr: str = "KKPR"
    status: str = "Proses"
    tanggal_terbit: Optional[str] = None
    nomor_dokumen: Optional[str] = None


class LeadCreateReq(BaseModel):
    developer: DeveloperModel
    proyek: ProyekModel
    tata_ruang: TataRuangModel = TataRuangModel()
    perizinan: PerizinanModel = PerizinanModel()
    sumber: str = "OSS"
    confidence: int = 80
    alert_type: str = "kkpr_terbit"


class CrmUpdateReq(BaseModel):
    crm_status: Literal["NEW", "DIHUBUNGI", "RESPON", "MEETING", "PROPOSAL", "KERJASAMA"]
    catatan: Optional[str] = None


class FollowUpReq(BaseModel):
    catatan: str
    tipe: str = "note"


class SettingsReq(BaseModel):
    regions: List[dict]
    project_types: List[dict]


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------
@api_router.post("/auth/login")
async def login(body: LoginReq, response: Response):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email atau password salah")
    if not user.get("active", True):
        raise HTTPException(status_code=403, detail="Akun dinonaktifkan")
    uid = str(user["_id"])
    set_auth_cookies(response, create_access_token(uid, email), create_refresh_token(uid))
    return clean_user(user)


@api_router.post("/auth/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"status": "ok"}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return clean_user(user)


# ---------------------------------------------------------------------------
# User management (super admin)
# ---------------------------------------------------------------------------
@api_router.get("/users")
async def list_users(admin: dict = Depends(require_admin)):
    users = await db.users.find().sort("created_at", -1).to_list(500)
    return [clean_user(u) for u in users]


@api_router.post("/users")
async def create_user(body: UserCreateReq, admin: dict = Depends(require_admin)):
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email sudah terdaftar")
    doc = {
        "email": email, "password_hash": hash_password(body.password),
        "name": body.name, "role": body.role, "regions": body.regions,
        "active": True, "created_at": now_utc().isoformat(),
    }
    res = await db.users.insert_one(doc)
    doc["_id"] = res.inserted_id
    return clean_user(doc)


@api_router.put("/users/{user_id}")
async def update_user(user_id: str, body: UserUpdateReq, admin: dict = Depends(require_admin)):
    updates = {}
    for field in ["name", "role", "active", "regions"]:
        val = getattr(body, field)
        if val is not None:
            updates[field] = val
    if body.password:
        updates["password_hash"] = hash_password(body.password)
    if not updates:
        raise HTTPException(status_code=400, detail="Tidak ada perubahan")
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": updates})
    u = await db.users.find_one({"_id": ObjectId(user_id)})
    if not u:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    return clean_user(u)


@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(require_admin)):
    if str(admin["_id"]) == user_id:
        raise HTTPException(status_code=400, detail="Tidak dapat menghapus akun sendiri")
    await db.users.delete_one({"_id": ObjectId(user_id)})
    return {"status": "deleted"}


# ---------------------------------------------------------------------------
# Leads
# ---------------------------------------------------------------------------
@api_router.get("/leads")
async def list_leads(
    user: dict = Depends(get_current_user),
    wilayah: Optional[str] = None,
    jenis: Optional[str] = None,
    prioritas: Optional[str] = None,
    crm_status: Optional[str] = None,
    alert_type: Optional[str] = None,
    search: Optional[str] = None,
):
    q = {}
    if wilayah and wilayah != "all":
        q["proyek.kabupaten_kota"] = wilayah
    if jenis and jenis != "all":
        q["proyek.jenis"] = jenis
    if prioritas and prioritas != "all":
        q["prioritas"] = prioritas
    if crm_status and crm_status != "all":
        q["crm_status"] = crm_status
    if alert_type and alert_type != "all":
        q["alert_type"] = alert_type
    if search:
        q["$or"] = [
            {"developer.nama": {"$regex": search, "$options": "i"}},
            {"proyek.nama": {"$regex": search, "$options": "i"}},
            {"proyek.kabupaten_kota": {"$regex": search, "$options": "i"}},
        ]
    leads = await db.leads.find(q).sort("tanggal_ditemukan", -1).to_list(1000)
    return [serialize_lead(l) for l in leads]


@api_router.get("/leads/{lead_id}")
async def get_lead(lead_id: str, user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead tidak ditemukan")
    return serialize_lead(lead)


@api_router.post("/leads")
async def create_lead(body: LeadCreateReq, user: dict = Depends(get_current_user)):
    settings = await get_settings_doc()
    target_regions = [r["name"] for r in settings["regions"] if r.get("target")]
    lead = {
        "id": str(uuid.uuid4()),
        "developer": body.developer.model_dump(),
        "proyek": body.proyek.model_dump(),
        "tata_ruang": body.tata_ruang.model_dump(),
        "perizinan": body.perizinan.model_dump(),
        "sumber": body.sumber,
        "confidence": body.confidence,
        "alert_type": body.alert_type,
        "lokasi_target": body.proyek.kabupaten_kota in target_regions,
        "crm_status": "NEW",
        "tanggal_ditemukan": now_utc().isoformat(),
        "created_by": str(user["_id"]),
        "aktivitas": [],
    }
    scoring = compute_score(lead)
    lead.update(scoring)
    await db.leads.insert_one(dict(lead))
    await create_notification(lead)
    emailed = await notify_new_lead_email(lead)
    await notify_telegram_lead(lead)
    result = serialize_lead(lead)
    result["auto_emailed_to"] = emailed
    return result


@api_router.put("/leads/{lead_id}/crm")
async def update_crm(lead_id: str, body: CrmUpdateReq, user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead tidak ditemukan")
    activity = {
        "id": str(uuid.uuid4()), "tipe": "status", "tanggal": now_utc().isoformat(),
        "oleh": user["name"],
        "catatan": body.catatan or f"Status diubah ke {body.crm_status}",
        "status": body.crm_status,
    }
    await db.leads.update_one(
        {"id": lead_id},
        {"$set": {"crm_status": body.crm_status}, "$push": {"aktivitas": activity}},
    )
    lead = await db.leads.find_one({"id": lead_id})
    return serialize_lead(lead)


@api_router.post("/leads/{lead_id}/followup")
async def add_followup(lead_id: str, body: FollowUpReq, user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead tidak ditemukan")
    activity = {
        "id": str(uuid.uuid4()), "tipe": body.tipe, "tanggal": now_utc().isoformat(),
        "oleh": user["name"], "catatan": body.catatan,
    }
    await db.leads.update_one({"id": lead_id}, {"$push": {"aktivitas": activity}})
    lead = await db.leads.find_one({"id": lead_id})
    return serialize_lead(lead)


def build_lead_alert_email(lead: dict):
    dev = lead["developer"]
    proyek = lead["proyek"]
    perizinan = lead["perizinan"]
    subject = f"🔔 LEAD PERUMAHAN BARU — {dev['nama']}"
    html = (
        f'<table role="presentation" width="100%" style="max-width:560px"><tr><td '
        f'style="padding:24px;font-family:Arial,sans-serif;color:#0f172a">'
        f'<h2 style="color:#065F46;margin:0 0 4px">PROPERLEAD</h2>'
        f'<p style="color:#64748b;font-size:12px;margin:0 0 16px">Project &amp; Finance Intelligence</p>'
        f'<div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:12px;padding:16px">'
        f'<p style="margin:0 0 8px;font-weight:bold;font-size:16px">🔔 LEAD PERUMAHAN BARU</p>'
        f'<p style="margin:4px 0"><strong>Developer:</strong> {escape(dev["nama"])}</p>'
        f'<p style="margin:4px 0"><strong>Lokasi:</strong> {escape(proyek.get("kabupaten_kota",""))}</p>'
        f'<p style="margin:4px 0"><strong>Kegiatan:</strong> {escape(proyek.get("jenis",""))} — {escape(proyek.get("nama",""))}</p>'
        f'<p style="margin:4px 0"><strong>Milestone:</strong> {escape(perizinan.get("jenis_kkpr",""))} — {escape(perizinan.get("status",""))}</p>'
        f'<p style="margin:4px 0"><strong>Skor Lead:</strong> {lead.get("score",0)} (Prioritas {lead.get("prioritas","C")})</p>'
        f'<p style="margin:4px 0"><strong>Sumber:</strong> {escape(lead.get("sumber","OSS"))}</p>'
        f'</div>'
        f'<p style="font-size:12px;color:#888;margin-top:16px">Dikirim oleh PROPERLEAD. '
        f'Kami tidak pernah meminta password atau data kartu Anda melalui email.</p>'
        f'</td></tr></table>'
    )
    return subject, html


async def notify_new_lead_email(lead: dict):
    """Auto email untuk lead Prioritas A di wilayah target → super admin + marketing wilayah tsb."""
    if lead.get("prioritas") != "A" or not lead.get("lokasi_target"):
        return []
    region = lead.get("proyek", {}).get("kabupaten_kota")
    recipients = await db.users.find(
        {"active": True, "$or": [{"role": "super_admin"}, {"regions": region}]}
    ).to_list(200)
    if not recipients:
        return []
    subject, html = build_lead_alert_email(lead)

    async def _one(email):
        try:
            await send_email(to=email, subject=subject, html=html)
            return email
        except Exception as e:
            logger.error(f"Auto-notify gagal ke {email}: {e}")
            return None

    sent = await asyncio.gather(*[_one(u["email"]) for u in recipients])
    return [s for s in sent if s]


@api_router.post("/leads/{lead_id}/send-alert")
async def send_lead_alert(lead_id: str, user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead tidak ditemukan")
    subject, html = build_lead_alert_email(lead)
    email_id = await send_email(to=user["email"], subject=subject, html=html)
    return {"status": "sent", "email_id": email_id, "to": user["email"]}


# ---------------------------------------------------------------------------
# Telegram notifications
# ---------------------------------------------------------------------------
async def send_telegram(text: str) -> bool:
    token = os.environ.get("TELEGRAM_TOKEN")
    chat = os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat:
        return False
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": chat, "text": text, "parse_mode": "HTML",
                      "disable_web_page_preview": True},
            )
        r.raise_for_status()
        return True
    except Exception as e:
        logger.error(f"Telegram gagal: {e}")
        return False


async def notify_telegram_lead(lead: dict) -> bool:
    labels = {"rdtr_baru": "🟢 RDTR Baru", "kkpr_terbit": "🔵 KKPR/PKKPR Terbit",
              "perubahan_status": "🟠 Perubahan Status"}
    milestone = labels.get(lead.get("alert_type"), "Lead")
    text = (
        "🔔 <b>LEAD PERUMAHAN BARU</b>\n"
        f"Developer: {lead['developer']['nama']}\n"
        f"Proyek: {lead['proyek']['nama']}\n"
        f"Lokasi: {lead['proyek']['kabupaten_kota']}\n"
        f"Kegiatan: {lead['proyek']['jenis']}\n"
        f"Milestone: {milestone}\n"
        f"Perizinan: {lead['perizinan']['jenis_kkpr']} — {lead['perizinan']['status']}\n"
        f"Skor: {lead['score']} (Prioritas {lead['prioritas']})\n"
        f"Sumber: {lead['sumber']}"
    )
    return await send_telegram(text)


# ---------------------------------------------------------------------------
# OSS auto-sync (SIMULATED ingest — replace with real OSS/GISTARU API later)
# ---------------------------------------------------------------------------
OSS_DEV_POOL = [
    {"nama": "PT Meratus Griya Persada", "nib": "9120011122233", "tag": "Meratus"},
    {"nama": "PT Borneo Land Sejahtera", "nib": "9120044455566", "tag": "Borneo"},
    {"nama": "PT Kalimantan Habitat Utama", "nib": "9120077788899", "tag": "Habitat"},
    {"nama": "CV Amanah Property Banua", "nib": "", "tag": "Amanah"},
    {"nama": "PT Intan Permata Residence", "nib": "9120022233344", "tag": "Permata"},
    {"nama": "PT Banua Mega Konstruksi", "nib": "9120055566677", "tag": "Mega"},
    {"nama": "PT Sungai Martapura Land", "nib": "9120088899900", "tag": "Martapura"},
    {"nama": "CV Rahmat Bumi Selatan", "nib": "", "tag": "Rahmat"},
]
OSS_PROJECT_WORDS = ["Perumahan", "Cluster", "Grand", "Taman", "Green", "Bumi", "Griya"]
REGION_COORDS = {
    "Banjarmasin": (-3.3186, 114.5944),
    "Banjarbaru": (-3.4426, 114.8331),
    "Kabupaten Banjar": (-3.4113, 114.8419),
    "Tanah Laut": (-3.7997, 114.7842),
    "Barito Kuala": (-3.0025, 114.7594),
    "Tapin": (-2.9276, 115.1509),
}


async def generate_and_store_lead(source: str = "OSS (Auto-Sync)"):
    settings = await get_settings_doc()
    all_regions = [r["name"] for r in settings["regions"]]
    target_regions = [r["name"] for r in settings["regions"] if r.get("target")]
    enabled_types = [t["name"] for t in settings["project_types"] if t.get("enabled")] or ["Perumahan"]

    region = random.choice((target_regions or all_regions) + all_regions)
    jenis = random.choice(enabled_types)
    dev = random.choice(OSS_DEV_POOL)
    status = random.choices(["Terbit", "Proses", "Belum"], weights=[6, 3, 1])[0]
    alert = "kkpr_terbit" if status == "Terbit" else random.choice(["perubahan_status", "rdtr_baru"])
    lat, lng = REGION_COORDS.get(region, (-3.4, 114.8))
    coord = f"{round(lat + random.uniform(-0.05, 0.05), 4)}, {round(lng + random.uniform(-0.05, 0.05), 4)}"
    has_rdtr = random.random() < 0.7

    lead = {
        "id": str(uuid.uuid4()),
        "developer": {"nama": dev["nama"], "nib": dev.get("nib", ""), "alamat": region, "kontak": ""},
        "proyek": {
            "nama": f"{random.choice(OSS_PROJECT_WORDS)} {dev['tag']} {random.choice(['Asri','Regency','Permai','Indah','City'])}",
            "jenis": jenis, "lokasi": region, "kabupaten_kota": region, "kecamatan": "",
            "luas_ha": round(random.uniform(1.0, 12.0), 1), "koordinat": coord,
        },
        "tata_ruang": {
            "rdtr": f"RDTR {region} 2024" if has_rdtr else None,
            "zona": "Zona Perumahan (R-3)" if has_rdtr else None,
            "ketentuan_zonasi": "KDB 60%, KLB 1.2" if has_rdtr else None,
        },
        "perizinan": {
            "jenis_kkpr": random.choice(["KKPR", "PKKPR"]), "status": status,
            "tanggal_terbit": now_utc().date().isoformat() if status == "Terbit" else None,
            "nomor_dokumen": f"{random.choice(['KKPR','PKKPR'])}/{random.randint(1000,9999)}/2026" if status == "Terbit" else None,
        },
        "sumber": source, "confidence": random.randint(55, 95), "alert_type": alert,
        "lokasi_target": region in target_regions,
        "crm_status": "NEW", "tanggal_ditemukan": now_utc().isoformat(),
        "created_by": "auto-sync", "aktivitas": [],
    }
    lead.update(compute_score(lead))
    await db.leads.insert_one(dict(lead))
    await create_notification(lead)
    emailed = await notify_new_lead_email(lead)
    await notify_telegram_lead(lead)
    return lead, emailed


async def _ingest_batch(n: int):
    for _ in range(n):
        try:
            await generate_and_store_lead()
        except Exception as e:
            logger.error(f"Ingest error: {e}")


def _check_cron_auth(authorization: Optional[str]):
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="unauthorized")
    token = authorization[7:]
    if not secret or not hmac.compare_digest(token, secret):
        raise HTTPException(status_code=401, detail="unauthorized")


@api_router.post("/cron/oss-ingest")
async def cron_oss_ingest(background: BackgroundTasks, authorization: Optional[str] = Header(None)):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    _check_cron_auth(authorization)
    background.add_task(_ingest_batch, random.randint(1, 2))
    return {"status": "accepted"}


@api_router.post("/ingest/run")
async def manual_ingest(user: dict = Depends(get_current_user)):
    lead, emailed = await generate_and_store_lead(source="OSS (Manual Sync)")
    return {"status": "ok", "lead": serialize_lead(lead), "auto_emailed_to": emailed}


# ---------------------------------------------------------------------------
# Daily digest (email + Telegram) — tiap pagi
# ---------------------------------------------------------------------------
async def run_daily_digest() -> dict:
    all_leads = await db.leads.find().to_list(3000)
    today = now_utc().date().isoformat()

    def is_today(l):
        return (l.get("tanggal_ditemukan") or "")[:10] == today

    today_leads = [l for l in all_leads if is_today(l)]
    baru = len(today_leads)
    kkpr = sum(1 for l in today_leads if l.get("perizinan", {}).get("status") == "Terbit")
    rdtr = sum(1 for l in today_leads if l.get("alert_type") == "rdtr_baru")
    ubah = sum(1 for l in today_leads if l.get("alert_type") == "perubahan_status")
    prioA = sum(1 for l in today_leads if l.get("prioritas") == "A")
    top = sorted(today_leads, key=lambda l: l.get("score", 0), reverse=True)[:5]
    tgl = now_utc().strftime("%d/%m/%Y")

    def rows_txt(l):
        return (f"• {l['developer']['nama']} — {l['proyek']['nama']} "
                f"({l['proyek']['kabupaten_kota']}) | Skor {l.get('score',0)}/{l.get('prioritas','C')}")

    tg_lines = [
        "📋 <b>RINGKASAN HARIAN PROPERLEAD</b>",
        f"Tanggal: {tgl}",
        f"🆕 Lead baru: {baru}  |  🔵 KKPR terbit: {kkpr}",
        f"🟢 RDTR baru: {rdtr}  |  🟠 Status berubah: {ubah}",
        f"🔥 Prioritas A: {prioA}  |  Total lead: {len(all_leads)}",
    ]
    if top:
        tg_lines.append("")
        tg_lines.append("<b>Prioritas hari ini:</b>")
        tg_lines += [rows_txt(l) for l in top]
    else:
        tg_lines.append("Tidak ada lead baru hari ini.")
    tg_text = "\n".join(tg_lines)

    def row_html(l):
        prio_color = {"A": "#991B1B", "B": "#92400E", "C": "#334155"}.get(l.get("prioritas"), "#334155")
        return (
            f'<tr><td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">{escape(l["developer"]["nama"])}</td>'
            f'<td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">{escape(l["proyek"]["nama"])}</td>'
            f'<td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">{escape(l["proyek"]["kabupaten_kota"])}</td>'
            f'<td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:bold;color:{prio_color}">{l.get("score",0)} / {l.get("prioritas","C")}</td></tr>'
        )

    table = "".join(row_html(l) for l in top) if top else (
        '<tr><td colspan="4" style="padding:12px;text-align:center;color:#94a3b8">Tidak ada lead baru hari ini.</td></tr>'
    )
    chip = lambda label, val, bg, col: (
        f'<td style="padding:6px"><div style="background:{bg};color:{col};border-radius:10px;padding:12px;text-align:center">'
        f'<div style="font-size:22px;font-weight:800">{val}</div><div style="font-size:11px">{label}</div></div></td>'
    )
    subject = f"Ringkasan Harian PROPERLEAD — {tgl}"
    html = (
        f'<table role="presentation" width="100%" style="max-width:600px"><tr><td '
        f'style="padding:24px;font-family:Arial,sans-serif;color:#0f172a">'
        f'<h2 style="color:#065F46;margin:0 0 4px">PROPERLEAD</h2>'
        f'<p style="color:#64748b;font-size:12px;margin:0 0 16px">Project &amp; Finance Intelligence</p>'
        f'<p style="font-weight:bold;font-size:16px;margin:0 0 12px">Ringkasan Harian — {tgl}</p>'
        f'<table width="100%" cellpadding="0" cellspacing="0"><tr>'
        f'{chip("Lead Baru", baru, "#ECFDF5", "#065F46")}'
        f'{chip("KKPR Terbit", kkpr, "#DBEAFE", "#1D4ED8")}'
        f'{chip("RDTR Baru", rdtr, "#DCFCE7", "#15803D")}'
        f'{chip("Status Berubah", ubah, "#FFEDD5", "#C2410C")}'
        f'</tr></table>'
        f'<p style="font-size:12px;color:#64748b;margin:8px 0 0">Prioritas A: <strong>{prioA}</strong> · Total lead: <strong>{len(all_leads)}</strong></p>'
        f'<p style="font-weight:600;font-size:13px;margin:16px 0 6px">Prioritas hari ini:</p>'
        f'<table width="100%" style="border:1px solid #e2e8f0;border-radius:8px;font-size:12px" cellpadding="0" cellspacing="0">'
        f'<tr style="background:#0f172a;color:#fff;text-align:left">'
        f'<th style="padding:8px">Developer</th><th style="padding:8px">Proyek</th>'
        f'<th style="padding:8px">Wilayah</th><th style="padding:8px;text-align:center">Skor</th></tr>'
        f'{table}</table>'
        f'<p style="font-size:11px;color:#94a3b8;margin-top:16px">Dikirim oleh PROPERLEAD. '
        f'Kami tidak pernah meminta password atau data kartu Anda melalui email.</p>'
        f'</td></tr></table>'
    )

    users = await db.users.find({"active": True}).to_list(200)
    emailed = []

    async def _one(email):
        try:
            await send_email(to=email, subject=subject, html=html)
            return email
        except Exception as e:
            logger.error(f"Digest email gagal ke {email}: {e}")
            return None

    for s in await asyncio.gather(*[_one(u["email"]) for u in users]):
        if s:
            emailed.append(s)
    telegram_sent = await send_telegram(tg_text)
    return {"emailed_to": emailed, "telegram_sent": telegram_sent, "stats": {
        "lead_baru": baru, "kkpr_terbit": kkpr, "rdtr_baru": rdtr,
        "status_berubah": ubah, "prioritas_a": prioA, "total": len(all_leads)}}


@api_router.post("/cron/daily-digest")
async def cron_daily_digest(background: BackgroundTasks, authorization: Optional[str] = Header(None)):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    _check_cron_auth(authorization)
    background.add_task(run_daily_digest)
    return {"status": "accepted"}


@api_router.post("/digest/run")
async def manual_digest(user: dict = Depends(get_current_user)):
    res = await run_daily_digest()
    return {"status": "ok", **res}


# ---------------------------------------------------------------------------
# Dashboard stats
# ---------------------------------------------------------------------------
@api_router.get("/dashboard/stats")
async def dashboard_stats(user: dict = Depends(get_current_user)):
    all_leads = await db.leads.find().to_list(2000)
    today = now_utc().date().isoformat()

    def is_today(l):
        return (l.get("tanggal_ditemukan") or "")[:10] == today

    lead_baru = sum(1 for l in all_leads if is_today(l))
    kkpr_terbit = sum(1 for l in all_leads if l.get("perizinan", {}).get("status") == "Terbit")
    rdtr_baru = sum(1 for l in all_leads if l.get("alert_type") == "rdtr_baru")
    status_berubah = sum(1 for l in all_leads if l.get("alert_type") == "perubahan_status")

    prioritas_count = {"A": 0, "B": 0, "C": 0}
    for l in all_leads:
        prioritas_count[l.get("prioritas", "C")] = prioritas_count.get(l.get("prioritas", "C"), 0) + 1

    pipeline = {s: 0 for s in CRM_STAGES}
    for l in all_leads:
        st = l.get("crm_status", "NEW")
        pipeline[st] = pipeline.get(st, 0) + 1

    region_count = {}
    for l in all_leads:
        r = l.get("proyek", {}).get("kabupaten_kota", "Lainnya")
        region_count[r] = region_count.get(r, 0) + 1

    return {
        "lead_baru_hari_ini": lead_baru,
        "kkpr_terbit": kkpr_terbit,
        "rdtr_baru": rdtr_baru,
        "status_berubah": status_berubah,
        "total_leads": len(all_leads),
        "prioritas": prioritas_count,
        "pipeline": pipeline,
        "per_wilayah": [{"wilayah": k, "jumlah": v} for k, v in region_count.items()],
    }


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------
async def create_notification(lead: dict):
    alert = lead.get("alert_type", "kkpr_terbit")
    titles = {
        "rdtr_baru": "RDTR Baru Terdeteksi",
        "kkpr_terbit": "KKPR/PKKPR Terbit",
        "perubahan_status": "Perubahan Status Perizinan",
    }
    notif = {
        "id": str(uuid.uuid4()),
        "lead_id": lead["id"],
        "alert_type": alert,
        "judul": titles.get(alert, "Lead Baru"),
        "pesan": f"{lead['developer']['nama']} — {lead['proyek']['nama']} di {lead['proyek']['kabupaten_kota']}",
        "prioritas": lead.get("prioritas", "C"),
        "read": False,
        "created_at": now_utc().isoformat(),
    }
    await db.notifications.insert_one(dict(notif))


@api_router.get("/notifications")
async def list_notifications(user: dict = Depends(get_current_user)):
    notifs = await db.notifications.find().sort("created_at", -1).to_list(200)
    out = []
    for n in notifs:
        n.pop("_id", None)
        out.append(n)
    unread = sum(1 for n in out if not n.get("read"))
    return {"items": out, "unread": unread}


@api_router.put("/notifications/{notif_id}/read")
async def mark_read(notif_id: str, user: dict = Depends(get_current_user)):
    await db.notifications.update_one({"id": notif_id}, {"$set": {"read": True}})
    return {"status": "ok"}


@api_router.put("/notifications/read-all")
async def mark_all_read(user: dict = Depends(get_current_user)):
    await db.notifications.update_many({}, {"$set": {"read": True}})
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Settings (target regions / project types)
# ---------------------------------------------------------------------------
async def get_settings_doc():
    doc = await db.settings.find_one({"_id": "config"})
    if not doc:
        doc = {"_id": "config", "regions": DEFAULT_REGIONS, "project_types": DEFAULT_PROJECT_TYPES}
        await db.settings.insert_one(dict(doc))
    return doc


@api_router.get("/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    doc = await get_settings_doc()
    doc.pop("_id", None)
    return doc


@api_router.put("/settings")
async def update_settings(body: SettingsReq, admin: dict = Depends(require_admin)):
    await db.settings.update_one(
        {"_id": "config"},
        {"$set": {"regions": body.regions, "project_types": body.project_types}},
        upsert=True,
    )
    doc = await get_settings_doc()
    doc.pop("_id", None)
    return doc


# ---------------------------------------------------------------------------
# Email
# ---------------------------------------------------------------------------
async def send_email(*, to: str, subject: str, html: str) -> Optional[str]:
    if not EMAIL_KEY:
        raise HTTPException(status_code=500, detail="Email belum dikonfigurasi")
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if EMAIL_REPLY_TO:
        payload["contact_email"] = EMAIL_REPLY_TO
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            resp = await c.post(f"{EMAIL_BASE_URL}/api/v1/email/send",
                                headers={"X-Email-Key": EMAIL_KEY}, json=payload)
        resp.raise_for_status()
        return resp.json().get("id")
    except httpx.HTTPStatusError as e:
        logger.error(f"Email send failed: {e.response.status_code} {e.response.text}")
        raise HTTPException(status_code=502, detail="Gagal mengirim email")
    except Exception as e:
        logger.error(f"Email send error: {e}")
        raise HTTPException(status_code=500, detail="Gagal mengirim email")


# ---------------------------------------------------------------------------
# Seed
# ---------------------------------------------------------------------------
async def seed_admin():
    email = os.environ.get("ADMIN_EMAIL", "admin@example.com").lower()
    password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": email})
    if not existing:
        await db.users.insert_one({
            "email": email, "password_hash": hash_password(password),
            "name": "Selvi Yuniastuti", "role": "super_admin",
            "regions": [r["name"] for r in DEFAULT_REGIONS if r["target"]],
            "active": True, "created_at": now_utc().isoformat(),
        })
        logger.info("Seeded super admin")
    elif not verify_password(password, existing["password_hash"]):
        await db.users.update_one({"email": email},
                                  {"$set": {"password_hash": hash_password(password), "role": "super_admin"}})
    # a demo marketing user
    demo = "marketing@properlead.id"
    if not await db.users.find_one({"email": demo}):
        await db.users.insert_one({
            "email": demo, "password_hash": hash_password("Marketing2026!"),
            "name": "Andi Marketing", "role": "user",
            "regions": ["Banjarbaru", "Kabupaten Banjar"],
            "active": True, "created_at": now_utc().isoformat(),
        })


SEED_LEADS = [
    {
        "developer": {"nama": "PT Griya Banua Sejahtera", "nib": "9120001234567", "alamat": "Jl. A. Yani KM 12, Banjarbaru", "kontak": "0511-4567890"},
        "proyek": {"nama": "Perumahan Banua Asri", "jenis": "Perumahan", "lokasi": "Jl. Trikora", "kabupaten_kota": "Banjarbaru", "kecamatan": "Landasan Ulin", "luas_ha": 8.5, "koordinat": "-3.4426, 114.8331"},
        "tata_ruang": {"rdtr": "RDTR Kota Banjarbaru 2023", "zona": "Zona Perumahan Kepadatan Sedang (R-3)", "ketentuan_zonasi": "KDB 60%, KLB 1.2"},
        "perizinan": {"jenis_kkpr": "PKKPR", "status": "Terbit", "tanggal_terbit": "2026-09-25", "nomor_dokumen": "PKKPR/1234/09/2026"},
        "sumber": "OSS", "confidence": 92, "alert_type": "kkpr_terbit",
    },
    {
        "developer": {"nama": "PT Intan Land Development", "nib": "9120009876543", "alamat": "Jl. Ahmad Yani, Martapura", "kontak": "0511-1122334"},
        "proyek": {"nama": "Cluster Intan Residence", "jenis": "Cluster", "lokasi": "Sungai Paring", "kabupaten_kota": "Kabupaten Banjar", "kecamatan": "Martapura", "luas_ha": 5.2, "koordinat": "-3.4113, 114.8419"},
        "tata_ruang": {"rdtr": "RDTR Kabupaten Banjar 2024", "zona": "Zona Perumahan (R-2)", "ketentuan_zonasi": "KDB 50%, KLB 1.0"},
        "perizinan": {"jenis_kkpr": "KKPR", "status": "Terbit", "tanggal_terbit": "2026-09-28", "nomor_dokumen": "KKPR/0456/09/2026"},
        "sumber": "OSS", "confidence": 88, "alert_type": "kkpr_terbit",
    },
    {
        "developer": {"nama": "CV Barito Makmur Properti", "nib": "", "alamat": "Marabahan", "kontak": ""},
        "proyek": {"nama": "Perumahan Barito Indah", "jenis": "Perumahan", "lokasi": "Marabahan Kota", "kabupaten_kota": "Barito Kuala", "kecamatan": "Marabahan", "luas_ha": 3.0, "koordinat": "-3.0025, 114.7594"},
        "tata_ruang": {"rdtr": None, "zona": "Zona Perumahan", "ketentuan_zonasi": None},
        "perizinan": {"jenis_kkpr": "KKPR", "status": "Proses", "tanggal_terbit": None, "nomor_dokumen": None},
        "sumber": "OSS", "confidence": 65, "alert_type": "perubahan_status",
    },
    {
        "developer": {"nama": "PT Bumi Serasi Kalimantan", "nib": "9120005566778", "alamat": "Jl. S. Parman, Banjarmasin", "kontak": "0511-3344556"},
        "proyek": {"nama": "Kawasan Residential Serasi Green", "jenis": "Kawasan Residential", "lokasi": "Banjarmasin Selatan", "kabupaten_kota": "Banjarmasin", "kecamatan": "Kertak Hanyar", "luas_ha": 12.0, "koordinat": "-3.3186, 114.5944"},
        "tata_ruang": {"rdtr": "RDTR Kota Banjarmasin 2022", "zona": "Zona Perumahan Kepadatan Tinggi (R-4)", "ketentuan_zonasi": "KDB 70%, KLB 2.0"},
        "perizinan": {"jenis_kkpr": "PKKPR", "status": "Terbit", "tanggal_terbit": "2026-09-20", "nomor_dokumen": "PKKPR/0789/09/2026"},
        "sumber": "OSS", "confidence": 95, "alert_type": "kkpr_terbit",
    },
    {
        "developer": {"nama": "PT Pelaihari Property Utama", "nib": "9120003322110", "alamat": "Pelaihari", "kontak": "0512-778899"},
        "proyek": {"nama": "Perumahan Tala Permai", "jenis": "Perumahan", "lokasi": "Pelaihari", "kabupaten_kota": "Tanah Laut", "kecamatan": "Pelaihari", "luas_ha": 6.0, "koordinat": "-3.7997, 114.7842"},
        "tata_ruang": {"rdtr": "RDTR Kabupaten Tanah Laut 2024", "zona": "Zona Perumahan (R-3)", "ketentuan_zonasi": "KDB 60%"},
        "perizinan": {"jenis_kkpr": "KKPR", "status": "Terbit", "tanggal_terbit": "2026-09-29", "nomor_dokumen": "KKPR/1101/09/2026"},
        "sumber": "OSS", "confidence": 90, "alert_type": "kkpr_terbit",
    },
    {
        "developer": {"nama": "PT Rantau Sejahtera Abadi", "nib": "", "alamat": "Rantau", "kontak": ""},
        "proyek": {"nama": "RDTR Baru Kawasan Rantau", "jenis": "Perumahan", "lokasi": "Rantau", "kabupaten_kota": "Tapin", "kecamatan": "Rantau", "luas_ha": None, "koordinat": "-2.9276, 115.1509"},
        "tata_ruang": {"rdtr": "RDTR Kabupaten Tapin 2026 (Baru)", "zona": "Zona Perumahan", "ketentuan_zonasi": "KDB 50%"},
        "perizinan": {"jenis_kkpr": "KKPR", "status": "Belum", "tanggal_terbit": None, "nomor_dokumen": None},
        "sumber": "OSS/GISTARU", "confidence": 55, "alert_type": "rdtr_baru",
    },
    {
        "developer": {"nama": "PT Cahaya Banjar Mandiri", "nib": "9120007788990", "alamat": "Gambut, Kabupaten Banjar", "kontak": "0511-9988776"},
        "proyek": {"nama": "Cluster Cahaya Gambut", "jenis": "Cluster", "lokasi": "Gambut", "kabupaten_kota": "Kabupaten Banjar", "kecamatan": "Gambut", "luas_ha": 4.5, "koordinat": "-3.3892, 114.6789"},
        "tata_ruang": {"rdtr": "RDTR Kabupaten Banjar 2024", "zona": "Zona Perumahan (R-2)", "ketentuan_zonasi": "KDB 55%"},
        "perizinan": {"jenis_kkpr": "PKKPR", "status": "Terbit", "tanggal_terbit": "2026-09-27", "nomor_dokumen": "PKKPR/1345/09/2026"},
        "sumber": "OSS", "confidence": 87, "alert_type": "kkpr_terbit",
    },
    {
        "developer": {"nama": "PT Landasan Ulin Property", "nib": "9120004455667", "alamat": "Banjarbaru", "kontak": "0511-5566778"},
        "proyek": {"nama": "Perumahan Ulin Regency", "jenis": "Perumahan", "lokasi": "Landasan Ulin", "kabupaten_kota": "Banjarbaru", "kecamatan": "Liang Anggang", "luas_ha": 10.0, "koordinat": "-3.4501, 114.7622"},
        "tata_ruang": {"rdtr": "RDTR Kota Banjarbaru 2023", "zona": "Zona Perumahan Kepadatan Sedang (R-3)", "ketentuan_zonasi": "KDB 60%, KLB 1.2"},
        "perizinan": {"jenis_kkpr": "KKPR", "status": "Proses", "tanggal_terbit": None, "nomor_dokumen": None},
        "sumber": "OSS", "confidence": 72, "alert_type": "perubahan_status",
    },
]


async def seed_leads():
    if await db.leads.count_documents({}) > 0:
        return
    settings = await get_settings_doc()
    target_regions = [r["name"] for r in settings["regions"] if r.get("target")]
    stages = ["NEW", "NEW", "DIHUBUNGI", "RESPON", "NEW", "NEW", "MEETING", "DIHUBUNGI"]
    base = now_utc()
    for i, raw in enumerate(SEED_LEADS):
        lead = dict(raw)
        lead["id"] = str(uuid.uuid4())
        lead["lokasi_target"] = lead["proyek"]["kabupaten_kota"] in target_regions
        lead["crm_status"] = stages[i % len(stages)]
        offset = 0 if i < 5 else (i - 3)
        lead["tanggal_ditemukan"] = (base - timedelta(days=offset)).isoformat()
        lead["created_by"] = "seed"
        lead["aktivitas"] = []
        lead.update(compute_score(lead))
        await db.leads.insert_one(dict(lead))
        await create_notification(lead)
    logger.info("Seeded leads + notifications")


# ---------------------------------------------------------------------------
# App wiring
# ---------------------------------------------------------------------------
@api_router.get("/")
async def root():
    return {"message": "PROPERLEAD API", "status": "ok"}


app.include_router(api_router)

_frontend = os.environ.get("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[_frontend, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.leads.create_index("id", unique=True)
    await db.notifications.create_index("id", unique=True)
    await seed_admin()
    await get_settings_doc()
    await seed_leads()


@app.on_event("shutdown")
async def shutdown():
    client.close()
