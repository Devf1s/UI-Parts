"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { HTMLAttributes, ReactNode, Ref } from "react";

type Shared = Omit<HTMLAttributes<HTMLElement>, "className" | "children"> & {
  className?: string;
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
};

/** A link when it has an `href` (client-side navigation for in-app paths), a button otherwise. */
export type ActionProps =
  | (Shared & {
      href: string;
      /** true: prefetch as soon as it is on screen. Default: when it is pointed at or focused. */
      prefetch?: boolean;
      target?: string;
      rel?: string;
    })
  | (Shared & { href?: undefined; type?: "button" | "submit" | "reset"; disabled?: boolean; name?: string; value?: string });

export function Action(props: ActionProps) {
  const router = useRouter();
  if (props.href !== undefined) {
    const { ref, href, prefetch, onPointerEnter, onFocus, ...rest } = props;
    if (/^(https?:|mailto:)/.test(href)) return <a ref={ref as Ref<HTMLAnchorElement>} href={href} onPointerEnter={onPointerEnter} onFocus={onFocus} {...rest} />;
    // a page full of these must not download every destination up front: prefetch on intent
    const warm = () => prefetch !== true && router.prefetch(href);
    return (
      <Link
        ref={ref as Ref<HTMLAnchorElement>}
        href={href}
        prefetch={prefetch === true ? true : false}
        onPointerEnter={(e) => {
          warm();
          onPointerEnter?.(e);
        }}
        onFocus={(e) => {
          warm();
          onFocus?.(e);
        }}
        {...rest}
      />
    );
  }
  const { ref, type = "button", ...rest } = props;
  return <button ref={ref as Ref<HTMLButtonElement>} type={type} {...rest} />;
}
