import { describe, it, expect } from 'vitest';
import { 
  buildEmergencySOSMessage, buildWhatsAppLink, buildSmsLink, 
  OFFICIAL_EMERGENCY_NUMBERS 
} from '../src/services/sosMessageBuilder';
import { ShelterFeature } from '../src/types';

describe('Emergency SOS Protocol & Message Construction', () => {
  const mockShelters: ShelterFeature[] = [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-66.0640, -33.1095] },
      properties: {
        id: 'SHL-01',
        name: 'Cuartel Bomberos El Trapiche',
        category: 'FIRE_STATION',
        province: 'San Luis',
        locality: 'El Trapiche',
        has_medical_support: true,
        has_water_supply: true,
        is_verified_reliable: true,
        operational_status: 'OPEN',
        contact_phone: '+542664493000',
      },
    },
  ];

  const mockFires = [
    {
      lat: -33.12,
      lon: -66.08,
      frp: 85,
      confidence: 'h',
      satellite: 'NOAA-20',
      acq_datetime: '2026-11-16 12:00',
      sensor: 'VIIRS' as const,
    },
  ];

  it('formats exact required SOS emergency message structure', () => {
    const payload = buildEmergencySOSMessage(
      -33.13,
      -66.07,
      15,
      mockFires,
      mockShelters
    );

    expect(payload.fullMessageText).toContain('EMERGENCIA INCENDIO. Mi ubicación:');
    expect(payload.fullMessageText).toContain('https://maps.google.com/?q=-33.13,-66.07 (±15m)');
    expect(payload.fullMessageText).toContain('Foco activo más cercano:');
    expect(payload.fullMessageText).toContain('Destino: Cuartel Bomberos El Trapiche (El Trapiche)');
  });

  it('generates valid WhatsApp and SMS links with prefilled body', () => {
    const sampleText = 'EMERGENCIA INCENDIO. Mi ubicación: https://maps.google.com/?q=-33.1,-66.1';
    const waLink = buildWhatsAppLink('+5492664112233', sampleText);
    expect(waLink).toContain('https://wa.me/5492664112233?text=');
    expect(waLink).toContain(encodeURIComponent(sampleText));

    const smsLink = buildSmsLink('+5492664112233', sampleText);
    expect(smsLink).toContain('sms:+5492664112233?body=');
  });

  it('includes verified official Argentine emergency numbers with sources', () => {
    const numbers = OFFICIAL_EMERGENCY_NUMBERS.map((n) => n.number);
    expect(numbers).toContain('911');
    expect(numbers).toContain('100');
    expect(numbers).toContain('103');

    OFFICIAL_EMERGENCY_NUMBERS.forEach((n) => {
      expect(n.source).toBeDefined();
      expect(n.role).toBeDefined();
    });
  });
});
