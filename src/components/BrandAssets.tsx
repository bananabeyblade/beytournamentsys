import logoDark from "@/assets/brand-drafts/zhuqian-logo-dark-draft.png";
import logoLight from "@/assets/brand-drafts/zhuqian-logo-light-draft.png";
import wordmarkDark from "@/assets/brand-drafts/zhuqian-wordmark-dark-draft.png";
import wordmarkLight from "@/assets/brand-drafts/zhuqian-wordmark-light-draft.png";

type BrandAssetProps = {
  className?: string;
};

export function BrandLogo({ className = "" }: BrandAssetProps) {
  return (
    <span className={`brand-logo inline-grid shrink-0 ${className}`}>
      <img src={logoDark} alt="竹塹陀螺集會所標誌" className="brand-asset-dark h-full w-full object-contain" />
      <img src={logoLight} alt="" aria-hidden="true" className="brand-asset-light h-full w-full object-contain" />
    </span>
  );
}

export function BrandWordmark({ className = "" }: BrandAssetProps) {
  return (
    <span className={`brand-wordmark inline-grid min-w-0 ${className}`}>
      <img
        src={wordmarkDark}
        alt="竹塹陀螺集會所 ZHUQIAN BEYBLADE CLUB"
        className="brand-asset-dark h-full w-full object-contain"
      />
      <img src={wordmarkLight} alt="" aria-hidden="true" className="brand-asset-light h-full w-full object-contain" />
    </span>
  );
}
