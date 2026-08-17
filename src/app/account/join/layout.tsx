import type { ReactNode } from "react";
import { privatePageMetadata } from "@/lib/site-metadata";

export const metadata = privatePageMetadata();

export default function AccountJoinLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
