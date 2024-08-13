import { NextResponse } from "next/server";
import { gql, GraphQLClient } from "graphql-request";

const graphQLClient = new GraphQLClient(
  "https://api.studio.thegraph.com/query/23537/moxie_protocol_stats_mainnet/version/latest"
);

const HOURLY_SNAPSHOTS_QUERY = gql`
  query HourlySnapshots($symbol: String!) {
    subjectTokens(where: { symbol: $symbol }) {
      id
      symbol
      totalSupply
      uniqueHolders
      lifetimeVolume
      hourlySnapshots(orderBy: endTimestamp, orderDirection: asc, first: 1000) {
        endTimestamp
        endPrice
      }
    }
  }
`;

interface HourlySnapshotResponse {
  subjectTokens: Array<{
    id: string;
    symbol: string;
    totalSupply: string;
    uniqueHolders: string;
    lifetimeVolume: string;
    hourlySnapshots: Array<{
      endTimestamp: string;
      endPrice: string;
    }>;
  }>;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  console.log("Requested symbol:", symbol);

  try {
    const data = await graphQLClient.request<HourlySnapshotResponse>(
      HOURLY_SNAPSHOTS_QUERY,
      {
        symbol: symbol,
      }
    );

    // console.log("Raw GraphQL response:", JSON.stringify(data, null, 2));

    const subjectToken = data.subjectTokens[0];
    if (!subjectToken) {
      console.log("No subject token found for symbol:", symbol);
      return NextResponse.json(
        { error: "Fan token not found" },
        { status: 404 }
      );
    }

    const processedData = subjectToken.hourlySnapshots.map((snapshot) => ({
      date: new Date(parseInt(snapshot.endTimestamp, 10) * 1000).toISOString(),
      price: parseFloat(snapshot.endPrice),
    }));

    console.log("Processed hourly snapshots:", processedData.length);
    console.log("First snapshot:", processedData[0]);
    console.log("Last snapshot:", processedData[processedData.length - 1]);

    const response = {
      tokenInfo: {
        address: subjectToken.id,
        symbol: subjectToken.symbol,
        totalSupply: parseFloat(subjectToken.totalSupply),
        uniqueHolders: parseInt(subjectToken.uniqueHolders, 10),
        lifetimeVolume: parseFloat(subjectToken.lifetimeVolume),
      },
      hourlySnapshots: processedData,
    };

    console.log(
      `Returning data for ${response.tokenInfo.symbol} with ${processedData.length} snapshots`
    );
    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Error fetching hourly snapshots:", error);
    return NextResponse.json(
      { error: `Failed to fetch hourly snapshots: ${error.message}` },
      { status: 500 }
    );
  }
}