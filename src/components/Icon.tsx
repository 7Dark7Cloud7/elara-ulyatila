import { Bike, Bus, Car, Truck, Armchair, Users, Caravan, CarFront, type LucideIcon } from 'lucide-react';

/**
 * O ícone da categoria vem da base de dados (tr_vehicle_class.icon). Nem todos
 * os nomes do seed existem no lucide desta versão — o mapa converte-os.
 */
const ICONS: Record<string, LucideIcon> = {
  Car,
  Bike,
  Taxi: CarFront,
  Armchair,
  Users,
  Van: Caravan,
  Bus,
  Truck,
};

export const classIcon = (name: string): LucideIcon => ICONS[name] ?? Car;
