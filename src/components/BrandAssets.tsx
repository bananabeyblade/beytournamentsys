import logoDark from "@/assets/brand-drafts/zhuqian-logo-dark-draft.png";
import logoLight from "@/assets/brand-drafts/zhuqian-logo-light-draft.png";
import wordmarkDark from "@/assets/brand-drafts/zhuqian-wordmark-dark-draft.png";
import wordmarkLight from "@/assets/brand-drafts/zhuqian-wordmark-light-draft.png";

type BrandAssetProps = {
  className?: string;
};

export function BrandLogo({ className = "" }: BrandAssetProps) {
  return (
    <span className={`brand-logo relative inline-block shrink-0 overflow-hidden ${className}`}>
      <img
        src={logoDark}
        alt="竹塹陀螺集會所標誌"
        className="brand-asset-dark absolute top-[-3.3%] left-[-6%] h-auto w-[117.13%] max-w-none"
      />
      <img
        src={logoLight}
        alt=""
        aria-hidden="true"
        className="brand-asset-light absolute top-[-3.3%] left-[-6%] h-auto w-[117.13%] max-w-none"
      />
    </span>
  );
}

export function BrandWordmark({ className = "" }: BrandAssetProps) {
  return (
    <span className={`brand-wordmark relative inline-block min-w-0 overflow-hidden ${className}`}>
      <img
        src={wordmarkDark}
        alt="竹塹陀螺集會所 ZHUQIAN BEYBLADE CLUB"
        className="brand-asset-dark absolute top-[-23.3%] left-[-3.02%] h-auto w-[106.29%] max-w-none"
      />
      <img
        src={wordmarkLight}
        alt=""
        aria-hidden="true"
        className="brand-asset-light absolute top-[-23.3%] left-[-3.02%] h-auto w-[106.29%] max-w-none"
      />
    </span>
  );
}
