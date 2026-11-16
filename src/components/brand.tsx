import { ShieldCheck } from "lucide-react";

export function BrandMark({ logoUrl, className = "size-10" }: { logoUrl?: string | null; className?: string }) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt="" className={`${className} rounded-lg object-contain bg-white`} />;
  }
  return (
    <span className={`${className} flex items-center justify-center rounded-lg bg-navy-800 text-white`}>
      <ShieldCheck className="size-1/2" />
    </span>
  );
}
