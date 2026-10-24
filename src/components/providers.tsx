"use client";

import Link from "next/link";
import { LinkProvider, type LinkComponentProps } from "@cloudflare/kumo";
import { forwardRef, type ReactNode } from "react";

const AppLink = forwardRef<HTMLAnchorElement, LinkComponentProps>(
  function AppLink({ href, to, ...props }, ref) {
    const { onMouseEnter, onTouchStart, onClick, ...rest } = props;
    return (
      <Link
        ref={ref}
        href={href ?? to ?? "/"}
        {...rest}
        {...(onMouseEnter ? { onMouseEnter } : {})}
        {...(onTouchStart ? { onTouchStart } : {})}
        {...(onClick ? { onClick } : {})}
      />
    );
  },
);

export function Providers({ children }: { children: ReactNode }) {
  return <LinkProvider component={AppLink}>{children}</LinkProvider>;
}
