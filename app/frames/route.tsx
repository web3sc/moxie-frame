import { Button } from "frames.js/next";
import { frames } from "./frames";
import { appURL } from "../utils";
import mappings from "../../output_file.json";

// Add this new constant
const USERNAME_FID_MAP = new Map(mappings as [string, number][]);

interface Snapshot {
  date: string;
  price: number;
  [key: string]: any; // In case there are other fields
}

interface TokenInfo {
  totalSupply: number;
  uniqueHolders: number;
}

interface Data {
  hourlySnapshots: Snapshot[];
  tokenInfo: TokenInfo;
  [key: string]: any; // In case there are other fields
}

const frameHandler = frames(async (ctx: any) => {
  let symbol: string | undefined;

  if (ctx.message?.inputText) {
    // Handle search input
    const input = ctx.message.inputText.trim();
    if (input.startsWith("@")) {
      // Search by username
      const profileName = input.slice(1).toLowerCase();
      const fid = USERNAME_FID_MAP.get(profileName);
      if (fid) {
        symbol = `fid:${fid}`;
      } else {
        symbol = input; // Keep the input as is if not found
      }
    } else if (!isNaN(Number(input))) {
      // Search by FID
      symbol = `fid:${input}`;
    } else {
      symbol = input;
    }
  } else if (ctx.searchParams?.action === "random") {
    // Handle "Random" button click
    const randomIndex = Math.floor(Math.random() * mappings.length);
    const [username, fid] = mappings[randomIndex];
    symbol = `fid:${fid}`;
  } else if (ctx.message?.requesterFid) {
    // Use requester's FID for "My Token" action
    symbol = `fid:${ctx.message.requesterFid}`;
  }

  // If symbol is still not set, try to extract FID from URL
  if (!symbol && ctx.url) {
    const extractFid = (url: string): string | null => {
      try {
        const parsedUrl = new URL(url);
        return parsedUrl.searchParams.get("fid");
      } catch (e) {
        console.error("Error parsing URL:", e);
        return null;
      }
    };

    const fid = extractFid(ctx.url.toString());
    if (fid) {
      symbol = `fid:${fid}`;
    }
  }

  // If symbol is still not set, use default
  if (!symbol) {
    symbol = "fid:5650";
  }

  try {
    // Fetch hourly snapshots data
    const response = await fetch(`${appURL()}/api/hourly-snapshots?symbol=${symbol}`);
    const data: Data = await response.json();

    // Fetch farcaster network data
    const farcasterResponse = await fetch(`${appURL()}/api/hourly-snapshots?symbol=id:farcaster`);
    const farcasterData: Data = await farcasterResponse.json();

    if (!data || !data.tokenInfo) {
      // No fan token found, return the "No fan token yet" page
      return {
        image: (
          <div tw="flex flex-col p-8 bg-gray-900 text-white font-sans w-full h-full items-center justify-center">
            <h1 tw="text-6xl font-bold mb-4">No Fan Token Yet</h1>
            <p tw="text-4xl mb-8">
              This user doesn't have a Fan Token, or their auction is still ongoing.
            </p>
          </div>
        ),
        textInput: "Search by FID or @username",
        buttons: [
          <Button action="post" target={{ pathname: "/", query: { action: "search" } }}>
            🔎 Search Another
          </Button>
        ],
        state: { symbol: symbol },
      };
    }

    // Fetch user data
    const userResponse = await fetch(`${appURL()}/api/user-data?symbol=${symbol}`);
    const userData: any = await userResponse.json();

    // Extract user information
    const user = userData.userData.Socials.Social[0];
    const username = user.profileName;
    const displayName = user.profileDisplayName;
    const profileImage = user.profileImageContentValue?.image?.extraSmall || user.profileImage;

    // Helper function to group data by date and get the last value
    const groupDataByDate = (data: Snapshot[]): Snapshot[] => {
      return Object.values(
        data.reduce((acc: { [key: string]: Snapshot }, snapshot: Snapshot) => {
          const date = new Date(snapshot.date).toISOString().split("T")[0];
          acc[date] = snapshot;
          return acc;
        }, {})
      );
    };

    // Group chartData by date
    const chartData = groupDataByDate(data.hourlySnapshots);
    const farcasterStartDate = new Date(chartData[0].date);

    // Filter and group farcaster data starting from the same date as chartData
    const farcasterChartData = groupDataByDate(
      farcasterData.hourlySnapshots.filter(
        (snapshot: Snapshot) => new Date(snapshot.date) >= farcasterStartDate
      )
    );

    // Function to calculate percentage changes
    const calculatePercentageChanges = (data: Snapshot[]): Snapshot[] => {
      const firstPrice = data[0].price;
      return data.map((snapshot: Snapshot) => ({
        ...snapshot,
        percentageChange: ((snapshot.price - firstPrice) / firstPrice) * 100,
      }));
    };

    // Calculate percentage changes for chartData and farcasterChartData
    const chartDataWithPercentage = calculatePercentageChanges(chartData);
    const farcasterChartDataWithPercentage = calculatePercentageChanges(farcasterChartData);

    const chartPercentages = chartDataWithPercentage.map(
      (snapshot: Snapshot) => snapshot.percentageChange
    );
    const farcasterPercentages = farcasterChartDataWithPercentage.map(
      (snapshot: Snapshot) => snapshot.percentageChange
    );

    // Log data for debugging
    console.log("Grouped Chart Data:", chartData);
    console.log("Grouped Farcaster Chart Data:", farcasterChartData);
    console.log("Chart Percentages:", chartPercentages);
    console.log("Farcaster Percentages:", farcasterPercentages);

    const minPercentage = Math.min(...chartPercentages, ...farcasterPercentages);
    const maxPercentage = Math.max(...chartPercentages, ...farcasterPercentages);
    const percentageRange = maxPercentage - minPercentage;

    // Calculate percentage change
    const latestPercentage = chartPercentages[chartPercentages.length - 1];
    const earliestPercentage = chartPercentages[0];
    const percentageChange = ((latestPercentage - earliestPercentage) / earliestPercentage) * 100;

    // Calculate the comparison between the user's token and Farcaster Fan Token
    const farcasterLatestPercentage = farcasterPercentages[farcasterPercentages.length - 1];
    const farcasterEarliestPercentage = farcasterPercentages[0];
    const farcasterPercentageChange = ((farcasterLatestPercentage - farcasterEarliestPercentage) / farcasterEarliestPercentage) * 100;

    // Simple SVG chart
    const chartWidth = 1050;
    const chartHeight = 350;

    // Points for user data chart
    const points = chartDataWithPercentage
      .map((snapshot: Snapshot, index: number) => {
        const x = (index / (chartDataWithPercentage.length - 1)) * chartWidth;
        const y =
          chartHeight -
          ((snapshot.percentageChange - minPercentage) / percentageRange) *
            chartHeight;
        return `${x},${y}`;
      })
      .join(" ");

    // Points for farcaster network data chart
    const farcasterPoints = farcasterChartDataWithPercentage
      .map((snapshot: Snapshot, index: number) => {
        const x = (index / (farcasterChartDataWithPercentage.length - 1)) * chartWidth;
        const y =
          chartHeight -
          ((snapshot.percentageChange - minPercentage) / percentageRange) *
            chartHeight;
        return `${x},${y}`;
      })
      .join(" ");

    console.log("Points:", points);
    console.log("Farcaster Points:", farcasterPoints);

    const SUPPLY_DIVIDER = 1000000000000000000;

    const positiveText = `Did you know ${displayName}'s Fan Token is a better performing asset than the Farcaster Network Fan Token? Up ${latestPercentage.toFixed(2)}%! Compared to ${farcasterLatestPercentage.toFixed(2)}% \n\n BUY BEFORE IT GOES HIGHER!`;
    let encodedPositiveText = encodeURIComponent(positiveText).replace(/%25/g, '%2525');

    const positiveUrl = `https://warpcast.com/~/compose?text=${encodedPositiveText}&embeds[]=https://moxie-ft-x-fnft.vercel.app/frames?fid=${symbol.split(":")[1]}`;

    const negativeText = `OMG! I should have bought the Farcaster Network Fan Token as a proxy instead of @${displayName}. \n\n @zoz.eth was RIGHT! \n https://warpcast.com/zoz.eth/0xf80996f4`;
    const encodedNegativeText = encodeURIComponent(negativeText).replace(/%25/g, '%2525');

    const negativeUrl = `https://warpcast.com/~/compose?text=${encodedNegativeText}&embeds[]=https://moxie-ft-x-fnft.vercel.app/frames?fid=${symbol.split(":")[1]}`;

    return {
      image: (
        <div tw="flex flex-col p-8 bg-white-900 text-black font-sans w-full h-full">
          <div tw="flex justify-between items-center mb-4">
            <div tw="flex items-center">
              <img src={profileImage} tw="w-16 h-16 rounded-full mr-4" />
              <div tw="flex flex-col">
                <h2 tw="flex text-3xl font-bold m-0">
                  {displayName} Performance Vs Farcaster Network
                </h2>
                <p tw="flex text-xl text-gray-400 m-0">@{username}</p>
              </div>
            </div>
            <div tw="flex flex-col items-end">
              <div
                tw={`flex text-4xl font-bold ${
                  (latestPercentage - farcasterLatestPercentage) >= 0 ? "text-green-500" : "text-red-500"
                }`}
              >
                {(latestPercentage - farcasterLatestPercentage) >= 0 ? "+" : ""}
                {(latestPercentage - farcasterLatestPercentage).toFixed(2)}%
              </div>
            </div>
          </div>

          <div tw="relative flex">
            <svg width={chartWidth} height={chartHeight}>
              <path
                d={`M0,${chartHeight} ${points} ${chartWidth},${chartHeight}`}
                fill="url(#gradient)"
              />
              <polyline
                fill="none"
                stroke={(latestPercentage - farcasterLatestPercentage) > 0 ? "#0af03b" : "#f55663"}
                strokeWidth="3"
                points={points}
              />

              <polyline
                fill="none"
                stroke="#8A2BE2"
                strokeWidth="3"
                points={farcasterPoints}
              />
            </svg>
          </div>

          <div tw="flex justify-between mt-4 text-lg">
            <div tw="flex flex-col">
              <div tw="flex mb-2 text-xl">User Token Change: {latestPercentage.toFixed(2)}%</div>
              <div tw="flex text-xl">Farcaster Token Change: {farcasterLatestPercentage.toFixed(2)}%</div>
            </div>
            <div tw="flex  items-end">
              <div tw="flex mb-2 text-xl">
                Change Compared to Farcaster: {(latestPercentage - farcasterLatestPercentage).toFixed(2)}%
              </div>
            </div>
          </div>
        </div>
      ),
      textInput: "Search by FID or @username",
      buttons: [
        <Button
          action="post"
          target={{ pathname: "/", query: { action: "search" } }}
        >
          🔎 Search
        </Button>,
        <Button action="link" target={(latestPercentage - farcasterLatestPercentage) > 0 ? positiveUrl : negativeUrl}>
          Share
        </Button>,
      ],
      state: { symbol: symbol },
    };
  } catch (error) {
    console.error("Error fetching data:", error);
    // Return an error page
    return {
      image: (
        <div tw="flex flex-col p-8 bg-gray-900 text-white font-sans w-full h-full items-center justify-center">
          <h1 tw="text-4xl font-bold mb-4">Error</h1>
          <p tw="text-xl">
            An error occurred while fetching data. Please try again later.
          </p>
        </div>
      ),
      textInput: "Search by FID or @username",
      buttons: [
        <Button
          action="post"
          target={{ pathname: "/", query: { action: "search" } }}
        >
          🔎 Try Again
        </Button>
      ],
      state: { symbol: symbol },
    };
  }
});

export const GET = frameHandler;
export const POST = frameHandler;
