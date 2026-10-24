"use client";

import Image from "next/image";
import { useState } from "react";
import { Icon } from "./icon";

export function Cover({
  src,
  title,
  sizes = "(max-width: 640px) 44vw, (max-width: 1024px) 22vw, 185px",
  priority = false,
}: {
  src: string | null;
  title: string;
  sizes?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="cover-image">
      {src && !failed ? (
        <Image
          src={src}
          unoptimized
          alt={`Cover ${title}`}
          fill
          sizes={sizes}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="cover-placeholder">
          <Icon name="book" width="34" height="34" />
          <span>Cover belum tersedia</span>
        </div>
      )}
    </div>
  );
}
