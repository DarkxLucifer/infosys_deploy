import type { ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * InfraScan official mark — Infrastructure Scan Logo
 */
export function InfraScanMark({ className, alt = "InfraScan", ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  return (
    <img
      src="/infrascan-logo.png"
      alt={alt}
      className={cn("h-7 w-auto object-contain rounded-md", className)}
      {...props}
    />
  );
}
