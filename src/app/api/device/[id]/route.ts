import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Access global store initialized in server.js
    const store = global.deviceDataStore;
    
    if (!store || !store.has(id)) {
      return NextResponse.json(
        { error: "Device not found", id },
        { status: 404 }
      );
    }

    const device = store.get(id);
    return NextResponse.json(device);
  } catch (error) {
    console.error("Error in GET /api/device/[id]:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
