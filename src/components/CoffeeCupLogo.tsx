import coffeenaduLogoImg from '../assets/images/coffeenadu_logo.jpg';

interface CoffeeCupLogoProps {
  className?: string;
}

export function CoffeeCupLogo({ className = 'w-9 h-9' }: CoffeeCupLogoProps) {
  return (
    <span
      className={`${className} inline-flex items-center justify-center rounded-full bg-[#10243D] p-[2px] ring-2 ring-[#D9A441]/90 shadow-sm shrink-0 overflow-hidden select-none`}
    >
      <img
        src={coffeenaduLogoImg}
        alt="Coffeenadu logo"
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
        className="w-full h-full rounded-full object-cover pointer-events-none select-none"
      />
    </span>
  );
}
