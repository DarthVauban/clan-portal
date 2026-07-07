"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";

type LoadableImageProps = ImageProps & {
  wrapperClassName?: string;
};

export function LoadableImage({ wrapperClassName, className, onLoad, onError, src, alt, ...props }: LoadableImageProps) {
  const [imageState, setImageState] = useState({ src, loaded: false, failed: false });
  const loaded = imageState.src === src && imageState.loaded;
  const failed = imageState.src === src && imageState.failed;

  return (
    <span className={`loadable-image${loaded ? " loadable-image--loaded" : ""}${failed ? " loadable-image--failed" : ""}${wrapperClassName ? ` ${wrapperClassName}` : ""}`}>
      {!loaded && <span className="loadable-image__loader" aria-hidden="true" />}
      <Image
        {...props}
        src={src}
        alt={alt}
        className={className}
        onLoad={(event) => {
          setImageState({ src, loaded: true, failed: false });
          onLoad?.(event);
        }}
        onError={(event) => {
          setImageState({ src, loaded: true, failed: true });
          onError?.(event);
        }}
      />
    </span>
  );
}
