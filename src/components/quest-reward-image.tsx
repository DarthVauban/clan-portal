"use client";

import { useState } from "react";
import { LoadableImage } from "@/components/loadable-image";

export function QuestRewardImage({
  image,
  fallbackImage,
  alt,
}: {
  image: string;
  fallbackImage: string;
  alt: string;
}) {
  const [src, setSrc] = useState(image);

  return (
    <LoadableImage
      src={src}
      alt={alt}
      width={38}
      height={38}
      sizes="38px"
      onError={() => {
        if (src !== fallbackImage) setSrc(fallbackImage);
      }}
    />
  );
}
