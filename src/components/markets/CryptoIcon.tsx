import { useMemo, useState } from "react";

const iconModules = import.meta.glob<{ default: string }>(
  "../../../node_modules/cryptocurrency-icons/svg/color/*.svg",
  { eager: true },
);

interface CryptoIconProps {
  symbol: string;
  className?: string;
}

export function CryptoIcon({ symbol, className = "h-6 w-6" }: CryptoIconProps) {
  const [failed, setFailed] = useState(false);
  const iconUrl = useMemo(() => getCryptoIconUrl(symbol), [symbol]);
  const label = symbol.slice(0, 2).toUpperCase();

  if (!iconUrl || failed) {
    return (
      <span className={`${className} grid place-items-center rounded-full bg-accent-soft text-[10px] font-bold text-accent`}>
        {label}
      </span>
    );
  }

  return <img className={`${className} rounded-full`} src={iconUrl} alt="" onError={() => setFailed(true)} />;
}

function getCryptoIconUrl(symbol: string) {
  const normalizedSymbol = symbol.toLowerCase();
  const iconPath = Object.keys(iconModules).find((path) => path.endsWith(`/${normalizedSymbol}.svg`));

  return iconPath ? iconModules[iconPath].default : "";
}
