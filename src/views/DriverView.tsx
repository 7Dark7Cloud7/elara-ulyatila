import { useState } from 'react';
import { Clock, Gauge, ShieldAlert } from 'lucide-react';
import type { Driver, SessionUser, VehicleClass, Zone } from '../types';
import { DriverFicha } from '../components/DriverFicha';
import { DriverDashboard } from '../components/DriverDashboard';
import { DriverRehearsal, type Preview } from '../components/DriverRehearsal';
import { displayPlate } from '../lib/plates';
import { APOIO_PHONE } from '../lib/utils';

interface DriverViewProps {
  user: SessionUser | null;
  zones: Zone[];
  classes: VehicleClass[];
  driver: Driver | null;
  driverLoading: boolean;
  onDriverChanged: () => void;
  onLogin: () => void;
  onError: (message: string) => void;
}

export function DriverView({
  user, zones, classes, driver, driverLoading,
  onDriverChanged, onLogin, onError,
}: DriverViewProps) {
  // A simulação é um espelho, não um ecrã: abre por cima de qualquer estado em
  // que a pessoa esteja — antes de enviar, ou à espera da equipa.
  const [rehearsal, setRehearsal] = useState(false);

  if (rehearsal && driver) {
    return (
      <DriverRehearsal
        preview={previewOf(driver, zones, classes)}
        onClose={() => setRehearsal(false)}
      />
    );
  }

  if (!user) {
    return (
      <Card
        icon={<Gauge className="w-7 h-7" />}
        title="Trabalhar com a Elara"
        text="Entre na conta para começar a conduzir. A mesma conta do Elara serve aqui."
        action={<button onClick={onLogin} className={btnCls}>Entrar</button>}
      />
    );
  }

  if (driverLoading) {
    return <p className="text-center text-zinc-500 dark:text-zinc-400 py-16 text-sm">a carregar…</p>;
  }

  if (!driver) {
    return <DriverFicha user={user} zones={zones} classes={classes} onDone={onDriverChanged} onError={onError} />;
  }

  if (driver.status === 'pending') {
    return (
      <Card
        icon={<Clock className="w-7 h-7" />}
        title="Candidatura em análise"
        text={`A sua candidatura (${displayPlate(driver.plate)} · ${driver.model}) está com a equipa. Avisamos por aqui quando for aprovada.`}
        action={
          <button onClick={() => setRehearsal(true)} className={btnCls}>
            Ver como vai ser
          </button>
        }
      />
    );
  }

  if (driver.status !== 'approved') {
    return (
      <Card
        icon={<ShieldAlert className="w-7 h-7" />}
        title={driver.status === 'suspended' ? 'Conta suspensa' : 'Conta banida'}
        text="Fale com o suporte da Elara para perceber o que aconteceu e como resolver."
        action={
          <a href={`https://wa.me/${APOIO_PHONE}`} target="_blank" rel="noreferrer" className={btnCls}>
            Falar com o suporte
          </a>
        }
      />
    );
  }

  return (
    <DriverDashboard
      user={user}
      driver={driver}
      zones={zones}
      classes={classes}
      onDriverChanged={onDriverChanged}
      onError={onError}
    />
  );
}

/** O que o ensaio mostra de um motorista já inscrito: os campos da ficha dele. */
function previewOf(d: Driver, zones: Zone[], classes: VehicleClass[]): Preview {
  const cls = classes.find((c) => c.id === d.class_id) ?? null;
  const zone = zones.find((z) => z.id === d.home_zone_id) ?? null;
  return {
    publicName: d.public_name,
    plate: displayPlate(d.plate),
    model: d.model,
    year: String(d.year),
    classId: d.class_id,
    classLabel: cls?.label ?? d.class_id,
    classIcon: cls?.icon,
    classMinKz: cls?.min_kz ?? null,
    zoneName: zone?.name ?? null,
    province: d.province || zone?.province || null,
  };
}

function Card({ icon, title, text, action }: {
  icon: React.ReactNode; title: string; text: string; action?: React.ReactNode;
}) {
  return (
    <div className="animate-enter rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-8 text-center shadow-sm">
      <div className="w-14 h-14 rounded-2xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center mx-auto">
        {icon}
      </div>
      <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white mt-4">{title}</h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

const btnCls =
  'btn-main w-full h-12 rounded-2xl font-bold flex items-center justify-center gap-2';
