import { fetchMetadata } from "frames.js/next";
import { appURL } from "./utils";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: { userfid?: string };
}) {
  const framesUrl = new URL("/frames", appURL());

  if (searchParams.userfid) {
    framesUrl.searchParams.set("userfid", searchParams.userfid);
    framesUrl.searchParams.set("action", "fetch");
  }

  console.log("Fetching metadata from:", framesUrl.toString());

  // const castActionUrl = new URL("/api/cast-action", appURL());

  return {
    title: "Moxie Fan Token Chart",
    description: "Check the performance of Moxie Fan Tokens",
    openGraph: {
      title: "Moxie Fan Token Chart",
      description: "Check the performance of Moxie Fan Tokens",
      images: [`${framesUrl.origin}/api/og`],
    },
    other: {
      ...(await fetchMetadata(framesUrl)),
      // "fc:frame:cast_action:url": castActionUrl.toString(),
    },
  };
}

export default function Page() {
  return <span>Loading Moxie Fan Token Chart...</span>;
}