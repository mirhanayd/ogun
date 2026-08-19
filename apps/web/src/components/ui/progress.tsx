"use client"

import * as React from "react"
import { Progress as ProgressPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

// GitHub issue #61 — `indicatorClassName` EKLENDİ (shadcn'in vendor'lanmış
// bileşenine yapılan TEK değişiklik; dosyanın geri kalanı olduğu gibi).
// Dolgu rengi `bg-primary` olarak gömülüydü; besin öğesi paneli aynı çubuğu
// DURUM rengiyle (düşük / yeterliye yakın / yeterli / üst sınır üstü) çizmek
// zorunda ve orada marka yeşili KULLANILAMAZ (bkz. globals.css #59 GÖREV 1
// kuralı: "doygun yeşili yalnızca eylem ve marka için kullan, veri
// gösteriminde kullanma"). Varsayılan davranış DEĞİŞMEDİ.
function Progress({
  className,
  indicatorClassName,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & { indicatorClassName?: string }) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "relative flex h-1 w-full items-center overflow-x-hidden rounded-full bg-muted",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn("size-full flex-1 bg-primary transition-all", indicatorClassName)}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
