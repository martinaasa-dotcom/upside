import type { ReactNode } from "react";
import { privatePageMetadata } from "@/lib/site-metadata";

export const metadata = privatePageMetadata();

export default function CommunityJoinLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
