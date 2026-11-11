import { useEffect, useState } from "react";
import { signImageUrls } from "@/lib/format";

/** Given a stable list of storage paths, resolve them to signed URLs. */
export function useSignedUrls(bucket: string, paths: (string | null | undefined)[]) {
  const key = paths.filter(Boolean).join("|");
  const [map, setMap] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    const clean = paths.filter(Boolean) as string[];
    if (clean.length === 0) { setMap({}); return; }
    signImageUrls(bucket, clean).then((m) => { if (!cancelled) setMap(m); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucket, key]);
  return map;
}
