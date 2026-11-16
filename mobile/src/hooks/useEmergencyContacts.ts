import { useState, useEffect } from 'react';
import { EmergencyContact } from '../types';

const CONTACTS_STORAGE_KEY = 'semf_emergency_contacts';

const DEFAULT_CONTACTS: EmergencyContact[] = [
  {
    id: 'contact_1',
    name: 'Contacto de Confianza 1',
    phone: '',
    relationship: 'Familiar',
  },
];

export function useEmergencyContacts() {
  const [contacts, setContacts] = useState<EmergencyContact[]>(() => {
    try {
      const stored = localStorage.getItem(CONTACTS_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {}
    return DEFAULT_CONTACTS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(contacts));
    } catch {}
  }, [contacts]);

  const addContact = (name: string, phone: string, relationship: string) => {
    if (contacts.length >= 3) return false;
    const newContact: EmergencyContact = {
      id: `contact_${Date.now()}`,
      name: name.trim(),
      phone: phone.trim(),
      relationship: relationship.trim() || 'Contacto',
    };
    setContacts([...contacts, newContact]);
    return true;
  };

  const updateContact = (id: string, updated: Partial<EmergencyContact>) => {
    setContacts(contacts.map((c) => (c.id === id ? { ...c, ...updated } : c)));
  };

  const removeContact = (id: string) => {
    setContacts(contacts.filter((c) => c.id !== id));
  };

  return {
    contacts,
    addContact,
    updateContact,
    removeContact,
    canAddMore: contacts.length < 3,
  };
}
