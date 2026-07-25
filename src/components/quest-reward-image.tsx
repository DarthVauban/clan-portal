"use client";

import { useState } from "react";
import { LoadableImage } from "@/components/loadable-image";

export function QuestRewardImage({
  image,
  fallbackImage,
  alt,
  size = 38,
}: {
  image: string;
  fallbackImage: string;
  alt: string;
  size?: number;
}) {
  const [src, setSrc] = useState(image);

  return (
    <LoadableImage
      src={src}
      alt={alt}
      width={size}
      height={size}
      sizes={`${size}px`}
      onError={() => {
        if (src !== fallbackImage) setSrc(fallbackImage);
      }}
    />
  );
}
