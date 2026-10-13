import Image from "next/image"
import { cn } from "@/lib/utils"

/** Official, unmodified assets from resonata.io. */
export function BrandLogo({ iconOnly = false, className }: { iconOnly?: boolean; className?: string }) {
  return (
    <Image
      src={iconOnly ? "/brand/resonata-icon.png" : "/brand/resonata-wordmark.png"}
      alt="Resonata"
      width={iconOnly ? 512 : 588}
      height={iconOnly ? 512 : 114}
      className={cn(iconOnly ? "brand-icon size-9 object-contain" : "brand-wordmark", className)}
      priority
      unoptimized
    />
  )
}
