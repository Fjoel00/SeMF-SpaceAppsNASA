import React, { useState, useEffect, useRef } from 'react';
import { 
  AlertOctagon, Phone, MessageSquare, Share2, Users, 
  MapPin, ShieldAlert, X, Check, Flame, ChevronRight, AlertTriangle 
} from 'lucide-react';
import { useWakeLock } from '../hooks/useWakeLock';
import { useGeolocation } from '../hooks/useGeolocation';
import { useEmergencyContacts } from '../hooks/useEmergencyContacts';
import { 
  buildEmergencySOSMessage, buildWhatsAppLink, buildSmsLink, 
  OFFICIAL_EMERGENCY_NUMBERS 
} from '../services/sosMessageBuilder';
import { ShelterCollection, SOSPayload } from '../types';

type SOSState = 'IDLE' | 'PRESSING' | 'COUNTDOWN' | 'TRIGGERED';

export const PanicView: React.FC = () => {
  // Wake Lock active during emergency screen
  useWakeLock(true);

  const { location, requestSinglePosition } = useGeolocation(false);
  const { contacts, addContact, removeContact, canAddMore } = useEmergencyContacts();

  const [sosState, setSosState] = useState<SOSState>('IDLE');
  const [pressProgress, setPressProgress] = useState<number>(0);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(5);
  const [sosPayload, setSosPayload] = useState<SOSPayload | null>(null);
  const [showContactsModal, setShowContactsModal] = useState<boolean>(false);
  const [shelters, setShelters] = useState<any[]>([]);
  const [activeFires, setActiveFires] = useState<any[]>([]);

  // Form states for new contact
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactRel, setNewContactRel] = useState('Familiar');

  const pressTimerRef = useRef<any>(null);
  const countdownIntervalRef = useRef<any>(null);
  const pressStartTimeRef = useRef<number>(0);

  // Fetch shelters and fires for the SOS payload
  useEffect(() => {
    fetch('/api/shelters')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ShelterCollection) => {
        if (data?.features) setShelters(data.features);
      })
      .catch(() => {});

    fetch('/api/fires')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.events) setActiveFires(data.events);
      })
      .catch(() => {});
  }, []);

  // Handle Long Press Start
  const handleTouchStart = () => {
    if (sosState === 'TRIGGERED' || sosState === 'COUNTDOWN') return;

    setSosState('PRESSING');
    pressStartTimeRef.current = Date.now();

    // Haptic feedback if supported
    if ('vibrate' in navigator) {
      navigator.vibrate(60);
    }

    pressTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - pressStartTimeRef.current;
      const progress = Math.min(100, (elapsed / 1500) * 100);
      setPressProgress(progress);

      if (progress >= 100) {
        clearInterval(pressTimerRef.current);
        startCountdown();
      }
    }, 30);
  };

  // Handle Long Press Release
  const handleTouchEnd = () => {
    if (sosState === 'PRESSING') {
      clearInterval(pressTimerRef.current);
      setPressProgress(0);
      setSosState('IDLE');
    }
  };

  // Trigger 5-second countdown
  const startCountdown = () => {
    if ('vibrate' in navigator) {
      navigator.vibrate([100, 50, 150]);
    }
    setSosState('COUNTDOWN');
    setCountdownSeconds(5);

    countdownIntervalRef.current = setInterval(() => {
      setCountdownSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(countdownIntervalRef.current);
          confirmSOSTrigger();
          return 0;
        }
        if ('vibrate' in navigator) {
          navigator.vibrate(80);
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Cancel Countdown
  const handleCancelCountdown = () => {
    clearInterval(countdownIntervalRef.current);
    setSosState('IDLE');
    setPressProgress(0);
    setCountdownSeconds(5);
  };

  // Confirm and build payload
  const confirmSOSTrigger = async () => {
    if ('vibrate' in navigator) {
      navigator.vibrate([200, 100, 200, 100, 400]);
    }

    setSosState('TRIGGERED');

    // Get fresh GPS coordinates or fallback
    const freshPos = await requestSinglePosition(8000);
    const payload = buildEmergencySOSMessage(
      freshPos.lat,
      freshPos.lon,
      freshPos.accuracy,
      activeFires,
      shelters
    );
    setSosPayload(payload);
  };

  // Native Web Share
  const handleNativeShare = async () => {
    if (!sosPayload) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'ALERTA DE EMERGENCIA INCENDIO',
          text: sosPayload.fullMessageText,
          url: `https://maps.google.com/?q=${sosPayload.userLocation.lat},${sosPayload.userLocation.lon}`,
        });
      } catch {}
    } else {
      navigator.clipboard?.writeText(sosPayload.fullMessageText);
      alert('Mensaje copiado al portapapeles.');
    }
  };

  // Circular progress math
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (pressProgress / 100) * circumference;

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto">
      {/* Critical Legal Banner */}
      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-red-200">
        <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
        <p className="text-xs leading-relaxed">
          <strong className="font-bold text-red-300">AVISO VITAL:</strong> Esta herramienta de auxilio{' '}
          <span className="underline font-bold">NO reemplaza</span> llamar al 911. Si estás en peligro inminente, discá de inmediato.
        </p>
      </div>

      {/* Main SOS Interactive Area */}
      {sosState !== 'TRIGGERED' ? (
        <div className="glass-panel rounded-3xl p-6 flex flex-col items-center text-center space-y-6">
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-red-400 font-bold">
              Protocolo de Pánico Inmediato
            </span>
            <h1 className="font-display font-bold text-xl text-white mt-1">
              {sosState === 'COUNTDOWN' ? 'EMITIENDO AUXILIO...' : 'Botón de Emergencia SOS'}
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              {sosState === 'COUNTDOWN'
                ? 'Cancelable durante los próximos segundos si fue un error'
                : 'Mantené presionado durante 1,5 segundos para activar'}
            </p>
          </div>

          {/* Large SOS Button with Circular Progress Ring */}
          <div className="relative flex items-center justify-center select-none py-2">
            {sosState === 'COUNTDOWN' ? (
              <div className="w-48 h-48 rounded-full bg-danger/20 border-4 border-danger flex flex-col items-center justify-center animate-pulse">
                <span className="text-5xl font-mono font-black text-danger tabular-nums">
                  {countdownSeconds}s
                </span>
                <span className="text-[11px] font-bold tracking-wider uppercase text-red-300 mt-1">
                  Enviando alerta
                </span>
              </div>
            ) : (
              <div className="relative w-48 h-48 flex items-center justify-center">
                <svg className="absolute w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 180 180">
                  <circle
                    cx="90"
                    cy="90"
                    r={radius}
                    stroke="rgba(255, 45, 85, 0.15)"
                    strokeWidth="8"
                    fill="transparent"
                  />
                  <circle
                    cx="90"
                    cy="90"
                    r={radius}
                    stroke="#FF2D55"
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    className="transition-all duration-75"
                  />
                </svg>

                <button
                  id="main-sos-button"
                  onMouseDown={handleTouchStart}
                  onMouseUp={handleTouchEnd}
                  onMouseLeave={handleTouchEnd}
                  onTouchStart={handleTouchStart}
                  onTouchEnd={handleTouchEnd}
                  aria-label="Mantener presionado 1.5 segundos para activar SOS de emergencia"
                  className={`w-36 h-36 rounded-full flex flex-col items-center justify-center text-white font-bold shadow-sos-glow transition-transform duration-150 active:scale-95 ${
                    sosState === 'PRESSING'
                      ? 'bg-red-700 scale-95 shadow-red-600/70'
                      : 'bg-gradient-to-tr from-danger to-red-600 hover:scale-102'
                  }`}
                >
                  <AlertOctagon className="w-12 h-12 text-white mb-1" />
                  <span className="text-2xl font-black tracking-widest uppercase">SOS</span>
                </button>
              </div>
            )}
          </div>

          {/* Cancel button during Countdown */}
          {sosState === 'COUNTDOWN' ? (
            <button
              onClick={handleCancelCountdown}
              className="w-full py-3.5 rounded-xl bg-surface-glass border border-white/20 text-white font-bold text-sm hover:bg-white/10 active:scale-98 transition flex items-center justify-center gap-2"
            >
              <X className="w-4 h-4 text-slate-300" />
              <span>Cancelar activación ({countdownSeconds}s)</span>
            </button>
          ) : (
            <div className="text-[11px] text-slate-400 font-mono flex items-center justify-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-cyan-info" />
              <span>
                GPS: {location.lat.toFixed(4)}, {location.lon.toFixed(4)} (±{location.accuracy}m)
              </span>
            </div>
          )}
        </div>
      ) : (
        /* TRIGGERED STATE: Active Emergency Dispatch Hub */
        <div className="space-y-4">
          <div className="glass-panel rounded-2xl p-4 border border-danger/40 bg-red-950/20 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-danger animate-ping"></span>
                <span className="font-mono text-xs font-bold text-red-400 uppercase tracking-wider">
                  Alerta Emitida
                </span>
              </div>
              <button
                onClick={() => setSosState('IDLE')}
                className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded bg-surface-glass"
              >
                Volver
              </button>
            </div>

            {/* Formatted SOS Message Preview */}
            <div className="p-3 rounded-xl bg-black/40 border border-white/10 font-mono text-xs text-slate-200 leading-relaxed select-all">
              {sosPayload ? (
                sosPayload.fullMessageText
              ) : (
                <div className="flex items-center gap-2 text-slate-400">
                  <div className="w-3 h-3 border-2 border-danger border-t-transparent rounded-full animate-spin"></div>
                  <span>Generando paquete con GPS de alta precisión...</span>
                </div>
              )}
            </div>

            {/* Quick Dispatch Grid */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              <a
                href={
                  sosPayload
                    ? buildWhatsAppLink(
                        contacts[0]?.phone || '',
                        sosPayload.fullMessageText
                      )
                    : '#'
                }
                target="_blank"
                rel="noopener noreferrer"
                className="py-3 px-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex flex-col items-center justify-center gap-1 shadow-md transition active:scale-95"
              >
                <MessageSquare className="w-5 h-5" />
                <span>WhatsApp</span>
              </a>

              <a
                href={
                  sosPayload
                    ? buildSmsLink(
                        contacts[0]?.phone || '',
                        sosPayload.fullMessageText
                      )
                    : '#'
                }
                className="py-3 px-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex flex-col items-center justify-center gap-1 shadow-md transition active:scale-95"
              >
                <Phone className="w-5 h-5" />
                <span>SMS (Sin Datos)</span>
              </a>

              <button
                onClick={handleNativeShare}
                className="py-3 px-2 rounded-xl bg-surface-glass border border-white/20 hover:bg-white/10 text-white font-bold text-xs flex flex-col items-center justify-center gap-1 shadow-md transition active:scale-95"
              >
                <Share2 className="w-5 h-5 text-cyan-info" />
                <span>Compartir</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Direct Phone Dial Buttons */}
      <div className="glass-panel rounded-2xl p-4 space-y-3">
        <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">
          Llamada Inmediata a Centrales de Emergencia
        </h2>

        <div className="grid grid-cols-3 gap-2">
          {OFFICIAL_EMERGENCY_NUMBERS.filter((n) => n.primary).map((n) => (
            <a
              key={n.number}
              href={`tel:${n.number}`}
              className="py-3 px-2 rounded-xl bg-[#131B28] border border-white/10 hover:border-fire/50 flex flex-col items-center justify-center text-center transition active:scale-95"
            >
              <span className="text-lg font-black text-white">{n.number}</span>
              <span className="text-[10px] font-bold text-fire truncate w-full">{n.name}</span>
            </a>
          ))}
        </div>

        {/* Specialized provincial hotlines */}
        <div className="pt-2 border-t border-white/5 space-y-2">
          {OFFICIAL_EMERGENCY_NUMBERS.filter((n) => !n.primary).map((n) => (
            <a
              key={n.number}
              href={`tel:${n.number}`}
              className="flex items-center justify-between p-2.5 rounded-lg bg-surface-glass hover:bg-white/5 text-xs transition"
            >
              <div>
                <span className="font-bold text-white">{n.name}</span>
                <p className="text-[10px] text-slate-400">{n.role} ({n.jurisdiction})</p>
              </div>
              <span className="font-mono font-bold text-cyan-info text-xs">{n.display || n.number}</span>
            </a>
          ))}
        </div>
      </div>

      {/* Trusted Contacts Section */}
      <div className="glass-panel rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-fire" />
            <h3 className="font-bold text-xs text-white">Contactos de Confianza ({contacts.length}/3)</h3>
          </div>
          <button
            onClick={() => setShowContactsModal(!showContactsModal)}
            className="text-xs font-mono text-cyan-info hover:underline"
          >
            {showContactsModal ? 'Cerrar' : 'Configurar'}
          </button>
        </div>

        {contacts.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No tenés contactos guardados en este dispositivo.</p>
        ) : (
          <div className="space-y-1.5">
            {contacts.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between p-2.5 rounded-lg bg-surface-glass text-xs"
              >
                <div>
                  <span className="font-bold text-white">{c.name}</span>
                  <span className="text-[10px] text-slate-400 ml-1.5">({c.relationship})</span>
                  <p className="text-[10px] font-mono text-slate-300">{c.phone || 'Sin teléfono'}</p>
                </div>
                {sosState === 'TRIGGERED' && sosPayload && c.phone && (
                  <a
                    href={buildWhatsAppLink(c.phone, sosPayload.fullMessageText)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold"
                  >
                    Avisar
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Modal / Inline form to add contacts */}
        {showContactsModal && (
          <div className="pt-3 border-t border-white/10 space-y-2">
            <p className="text-[11px] text-slate-300">Agregá contactos para enviarles tu mensaje de auxilio:</p>
            {canAddMore ? (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Nombre y apellido"
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs text-white placeholder:text-slate-500"
                />
                <input
                  type="tel"
                  placeholder="Teléfono (ej: +5492664000000)"
                  value={newContactPhone}
                  onChange={(e) => setNewContactPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs text-white placeholder:text-slate-500 font-mono"
                />
                <button
                  onClick={() => {
                    if (newContactName && newContactPhone) {
                      addContact(newContactName, newContactPhone, newContactRel);
                      setNewContactName('');
                      setNewContactPhone('');
                    }
                  }}
                  className="w-full py-2 rounded-lg bg-fire hover:bg-fire-dark text-white font-bold text-xs transition"
                >
                  Guardar Contacto
                </button>
              </div>
            ) : (
              <p className="text-[10px] text-amber-alert">Límite alcanzado (máximo 3 contactos).</p>
            )}

            {/* List to delete */}
            {contacts.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-[11px] pt-1">
                <span className="text-slate-400">{c.name} ({c.phone})</span>
                <button
                  onClick={() => removeContact(c.id)}
                  className="text-red-400 hover:text-red-300 text-[10px]"
                >
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
