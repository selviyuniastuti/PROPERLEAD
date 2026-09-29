"""PROPERLEAD backend API tests."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip()
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "selviyuniastuti6@gmail.com"
ADMIN_PASS = "Properlead2026!"
MKT_EMAIL = "marketing@properlead.id"
MKT_PASS = "Marketing2026!"


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s, r.json()


@pytest.fixture(scope="session")
def admin_session():
    s, u = _login(ADMIN_EMAIL, ADMIN_PASS)
    return s, u


@pytest.fixture(scope="session")
def mkt_session():
    s, u = _login(MKT_EMAIL, MKT_PASS)
    return s, u


# ---------- Auth ----------
class TestAuth:
    def test_admin_login_sets_cookies(self):
        s, u = _login(ADMIN_EMAIL, ADMIN_PASS)
        assert "access_token" in s.cookies
        assert "refresh_token" in s.cookies
        assert u["email"] == ADMIN_EMAIL
        assert u["role"] == "super_admin"

    def test_mkt_login(self):
        s, u = _login(MKT_EMAIL, MKT_PASS)
        assert u["role"] == "user"

    def test_login_bad_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_me(self, admin_session):
        s, _ = admin_session
        r = s.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_me_unauth(self):
        r = requests.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401


# ---------- Dashboard ----------
class TestDashboard:
    def test_stats_shape(self, admin_session):
        s, _ = admin_session
        r = s.get(f"{API}/dashboard/stats", timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ["lead_baru_hari_ini", "kkpr_terbit", "rdtr_baru", "status_berubah",
                  "prioritas", "pipeline", "per_wilayah", "total_leads"]:
            assert k in d, f"missing {k}"
        assert set(["A", "B", "C"]).issubset(d["prioritas"].keys())
        for st in ["NEW", "DIHUBUNGI", "RESPON", "MEETING", "PROPOSAL", "KERJASAMA"]:
            assert st in d["pipeline"]


# ---------- Leads ----------
class TestLeads:
    def test_list_seeded(self, admin_session):
        s, _ = admin_session
        r = s.get(f"{API}/leads", timeout=15)
        assert r.status_code == 200
        leads = r.json()
        assert len(leads) >= 8, f"expected >=8 seeded leads, got {len(leads)}"

    def test_filter_wilayah(self, admin_session):
        s, _ = admin_session
        r = s.get(f"{API}/leads", params={"wilayah": "Banjarbaru"}, timeout=15)
        assert r.status_code == 200
        for l in r.json():
            assert l["proyek"]["kabupaten_kota"] == "Banjarbaru"

    def test_filter_prioritas(self, admin_session):
        s, _ = admin_session
        r = s.get(f"{API}/leads", params={"prioritas": "A"}, timeout=15)
        assert r.status_code == 200
        for l in r.json():
            assert l["prioritas"] == "A"

    def test_search(self, admin_session):
        s, _ = admin_session
        r = s.get(f"{API}/leads", params={"search": "Banua"}, timeout=15)
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_scoring_priority_A_when_all_conditions(self, admin_session):
        # Find a seeded lead that has KKPR Terbit + Perumahan + target region + developer data + RDTR
        s, _ = admin_session
        r = s.get(f"{API}/leads", timeout=15)
        leads = r.json()
        a_leads = [l for l in leads if l["prioritas"] == "A"]
        assert len(a_leads) >= 1
        top = a_leads[0]
        assert top["score"] >= 80
        # breakdown check
        assert isinstance(top.get("breakdown"), list)
        factors = {b["faktor"]: b["skor"] for b in top["breakdown"]}
        assert factors.get("KKPR/PKKPR terbit") == 40

    def test_create_lead_computes_score(self, admin_session):
        s, _ = admin_session
        payload = {
            "developer": {"nama": "TEST_PT AutoDev", "nib": "999", "alamat": "Banjarbaru"},
            "proyek": {"nama": "TEST Perumahan Auto", "jenis": "Perumahan",
                       "kabupaten_kota": "Banjarbaru", "kecamatan": "X", "luas_ha": 1.0},
            "tata_ruang": {"rdtr": "RDTR X", "zona": "R-3"},
            "perizinan": {"jenis_kkpr": "KKPR", "status": "Terbit",
                          "tanggal_terbit": "2026-01-01", "nomor_dokumen": "T/1"},
            "sumber": "OSS", "confidence": 90, "alert_type": "kkpr_terbit",
        }
        r = s.post(f"{API}/leads", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        lead = r.json()
        assert lead["prioritas"] == "A"
        assert lead["score"] == 100
        assert lead["lokasi_target"] is True
        assert lead["crm_status"] == "NEW"
        # persistence via GET
        gr = s.get(f"{API}/leads/{lead['id']}", timeout=15)
        assert gr.status_code == 200
        assert gr.json()["developer"]["nama"] == "TEST_PT AutoDev"
        # notification created
        nr = s.get(f"{API}/notifications", timeout=15)
        assert any(n["lead_id"] == lead["id"] for n in nr.json()["items"])
        # cleanup: leave since no delete endpoint; store id
        pytest.created_lead_id = lead["id"]

    def test_followup_and_crm_update(self, admin_session):
        s, _ = admin_session
        lead_id = getattr(pytest, "created_lead_id", None)
        if not lead_id:
            # create fresh
            r = s.get(f"{API}/leads", timeout=15)
            lead_id = r.json()[0]["id"]
        # follow up
        fr = s.post(f"{API}/leads/{lead_id}/followup",
                    json={"catatan": "TEST call made", "tipe": "call"}, timeout=15)
        assert fr.status_code == 200
        assert any(a["catatan"] == "TEST call made" for a in fr.json()["aktivitas"])
        # crm
        cr = s.put(f"{API}/leads/{lead_id}/crm",
                   json={"crm_status": "DIHUBUNGI", "catatan": "TEST moved"}, timeout=15)
        assert cr.status_code == 200
        assert cr.json()["crm_status"] == "DIHUBUNGI"


# ---------- Notifications ----------
class TestNotifications:
    def test_list_notifications(self, admin_session):
        s, _ = admin_session
        r = s.get(f"{API}/notifications", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and "unread" in d

    def test_mark_read_and_all(self, admin_session):
        s, _ = admin_session
        r = s.get(f"{API}/notifications", timeout=15)
        items = r.json()["items"]
        if items:
            nid = items[0]["id"]
            rr = s.put(f"{API}/notifications/{nid}/read", timeout=15)
            assert rr.status_code == 200
        ra = s.put(f"{API}/notifications/read-all", timeout=15)
        assert ra.status_code == 200
        r2 = s.get(f"{API}/notifications", timeout=15)
        assert r2.json()["unread"] == 0


# ---------- Users (super admin) ----------
class TestUsers:
    def test_list_users_admin(self, admin_session):
        s, _ = admin_session
        r = s.get(f"{API}/users", timeout=15)
        assert r.status_code == 200
        assert len(r.json()) >= 2

    def test_marketing_forbidden_users(self, mkt_session):
        s, _ = mkt_session
        r = s.get(f"{API}/users", timeout=15)
        assert r.status_code == 403

    def test_create_toggle_edit_delete(self, admin_session):
        s, _ = admin_session
        email = f"TEST_user_{uuid.uuid4().hex[:6]}@properlead.id"
        cr = s.post(f"{API}/users", json={
            "email": email, "password": "Password2026!",
            "name": "TEST User", "role": "user", "regions": []
        }, timeout=15)
        assert cr.status_code == 200, cr.text
        uid = cr.json()["id"]
        # toggle inactive
        u1 = s.put(f"{API}/users/{uid}", json={"active": False}, timeout=15)
        assert u1.status_code == 200 and u1.json()["active"] is False
        # edit role
        u2 = s.put(f"{API}/users/{uid}", json={"role": "super_admin"}, timeout=15)
        assert u2.status_code == 200 and u2.json()["role"] == "super_admin"
        # delete
        dr = s.delete(f"{API}/users/{uid}", timeout=15)
        assert dr.status_code == 200

    def test_cannot_delete_self(self, admin_session):
        s, u = admin_session
        r = s.delete(f"{API}/users/{u['id']}", timeout=15)
        assert r.status_code == 400


# ---------- Settings ----------
class TestSettings:
    def test_get_settings(self, admin_session):
        s, _ = admin_session
        r = s.get(f"{API}/settings", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "regions" in d and "project_types" in d

    def test_marketing_can_get_settings(self, mkt_session):
        s, _ = mkt_session
        r = s.get(f"{API}/settings", timeout=15)
        assert r.status_code == 200

    def test_marketing_cannot_put(self, mkt_session):
        s, _ = mkt_session
        r = s.put(f"{API}/settings", json={"regions": [], "project_types": []}, timeout=15)
        assert r.status_code == 403

    def test_admin_put_settings(self, admin_session):
        s, _ = admin_session
        cur = s.get(f"{API}/settings", timeout=15).json()
        # keep original then re-put
        r = s.put(f"{API}/settings", json={
            "regions": cur["regions"],
            "project_types": cur["project_types"]
        }, timeout=15)
        assert r.status_code == 200


# ---------- Email alert (real integration) ----------
class TestEmail:
    def test_send_alert(self, admin_session):
        s, _ = admin_session
        leads = s.get(f"{API}/leads", timeout=15).json()
        lead_id = leads[0]["id"]
        r = s.post(f"{API}/leads/{lead_id}/send-alert", timeout=45)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("status") == "sent"
        assert d.get("to") == ADMIN_EMAIL
