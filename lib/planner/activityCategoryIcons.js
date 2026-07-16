import {
  Anchor,
  BedDouble,
  Bike,
  CalendarCheck,
  Camera,
  Castle,
  Landmark,
  MapPin,
  Mountain,
  PartyPopper,
  Plane,
  ShoppingBag,
  TrainFront,
  Users,
  UtensilsCrossed,
  Waves,
} from "lucide-react";

/** @type {Record<string, import('react').ComponentType<{ className?: string, strokeWidth?: number, 'aria-hidden'?: boolean }>>} */
export const ACTIVITY_CATEGORY_ICON_MAP = {
  Anchor,
  UtensilsCrossed,
  Users,
  BedDouble,
  Waves,
  ShoppingBag,
  Mountain,
  Landmark,
  Castle,
  Camera,
  MapPin,
  Plane,
  TrainFront,
  PartyPopper,
  Bike,
  CalendarCheck,
};

/**
 * @param {string} iconKey
 * @returns {import('react').ComponentType<{ className?: string, strokeWidth?: number, 'aria-hidden'?: boolean }>}
 */
export function resolveActivityCategoryIcon(iconKey) {
  return ACTIVITY_CATEGORY_ICON_MAP[String(iconKey || "")] || MapPin;
}
