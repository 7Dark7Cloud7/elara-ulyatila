import type { ComponentType } from 'react';
import {
  BikeIcon,
  BusIcon,
  CarFrontIcon,
  SeatIcon,
  TruckIcon,
  UsersIcon,
  VanIcon,
  type ElaraIconProps,
} from './ElaraIcons';

/**
 * O ícone da categoria vem da base de dados (tr_vehicle_class.icon). Mapeia
 * cada nome para os ícones SVG próprios da Elara Ulyatila na mesma grelha 24×24.
 */
const ICONS: Record<string, ComponentType<ElaraIconProps>> = {
  Car: CarFrontIcon,
  Bike: BikeIcon,
  Taxi: CarFrontIcon,
  Armchair: SeatIcon,
  Users: UsersIcon,
  Van: VanIcon,
  Bus: BusIcon,
  Truck: TruckIcon,
};

export const classIcon = (name: string): ComponentType<ElaraIconProps> => ICONS[name] ?? CarFrontIcon;
