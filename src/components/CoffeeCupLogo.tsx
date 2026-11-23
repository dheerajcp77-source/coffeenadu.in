import coffeenaduLogoImg from '../assets/images/coffeenadu_logo.jpg';

interface CoffeeCupLogoProps {
  className?: string;
}

export function CoffeeCupLogo({ className = 'w-9 h-9' }: CoffeeCupLogoProps) {
  return (
    <img
      src={coffeenaduLogoImg}
      alt="Coffeenadu News logo"
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
      className={`${className} rounded-full object-cover shadow-2xs ring-1 ring-amber-400/50 pointer-events-none select-none`}
    />
  );
}
