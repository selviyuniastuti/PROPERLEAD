import { useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import api from "@/lib/api";
import { ALERT_META, PRIORITY_META } from "@/lib/meta";
import LeadDetailDialog from "@/components/LeadDetailDialog";
import { Button } from "@/components/ui/button";

const ALERT_COLOR = {
  rdtr_baru: "#10B981",
  kkpr_terbit: "#3B82F6",
  perubahan_status: "#F97316",
};

function parseCoord(s) {
  if (!s) return null;
  const parts = String(s).split(",").map((p) => parseFloat(p.trim()));
  if (parts.length !== 2 || parts.some((n) => Number.isNaN(n))) return null;
  return parts; // [lat, lng]
}

export default function MapPage() {
  const [leads, setLeads] = useState([]);
  const [active, setActive] = useState(null);

  const load = async () => {
    const { data } = await api.get("/leads");
    setLeads(data);
  };

  useEffect(() => {
    load();
  }, []);

  const points = leads
    .map((l) => ({ lead: l, pos: parseCoord(l.proyek?.koordinat) }))
    .filter((x) => x.pos);

  const openLead = async (id) => {
    const { data } = await api.get(`/leads/${id}`);
    setActive(data);
  };

  const center = points.length ? points[0].pos : [-3.4, 114.8];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
          Peta Sebaran Proyek
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {points.length} proyek berkoordinat · klik penanda untuk detail lead
        </p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4">
        {Object.entries(ALERT_META).map(([k, v]) => (
          <div key={k} className="flex items-center gap-2 text-sm text-slate-600">
            <span className="h-3 w-3 rounded-full" style={{ background: ALERT_COLOR[k] }} />
            {v.label}
          </div>
        ))}
      </div>

      <div
        className="rounded-xl overflow-hidden border border-slate-200 shadow-sm"
        data-testid="project-map"
      >
        <MapContainer
          center={center}
          zoom={9}
          scrollWheelZoom
          style={{ height: "560px", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {points.map(({ lead, pos }) => {
            const color = ALERT_COLOR[lead.alert_type] || "#3B82F6";
            const prio = PRIORITY_META[lead.prioritas];
            return (
              <CircleMarker
                key={lead.id}
                center={pos}
                radius={11}
                pathOptions={{ color, fillColor: color, fillOpacity: 0.7, weight: 2 }}
                data-testid={`map-marker-${lead.id}`}
              >
                <Tooltip>{lead.developer?.nama}</Tooltip>
                <Popup>
                  <div className="space-y-1" style={{ minWidth: 200 }}>
                    <p className="font-bold text-slate-900">{lead.developer?.nama}</p>
                    <p className="text-slate-600">{lead.proyek?.nama}</p>
                    <p className="text-slate-500 text-xs">
                      {lead.proyek?.kabupaten_kota} · {lead.proyek?.jenis}
                    </p>
                    <p className="text-xs">
                      <span className={`px-1.5 py-0.5 rounded-full border ${prio?.badge}`}>
                        {prio?.label} · {lead.score}
                      </span>
                    </p>
                    <Button
                      size="sm"
                      onClick={() => openLead(lead.id)}
                      className="bg-[#065F46] hover:bg-[#044E38] mt-1"
                      data-testid={`map-detail-${lead.id}`}
                    >
                      Lihat Detail
                    </Button>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>

      <LeadDetailDialog
        lead={active}
        open={!!active}
        onOpenChange={(v) => !v && setActive(null)}
        onChanged={async () => {
          await load();
          if (active) {
            const { data } = await api.get(`/leads/${active.id}`);
            setActive(data);
          }
        }}
      />
    </div>
  );
}
