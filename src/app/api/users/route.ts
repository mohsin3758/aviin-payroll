import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createUserSchema } from "@/lib/validations/user";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requireRole, hashPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
  createdAt: true,
} as const;

// GET /api/users — admin only, never returns passwordHash
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ["admin"]);
    const users = await db.user.findMany({
      select: userSelect,
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ data: users });
  } catch (error) {
    return handleApiError(error, "fetch users");
  }
}

// POST /api/users — admin only, creates a new login
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin"]);
    const body = await request.json();
    const parsed = createUserSchema.parse(body);

    const existing = await db.user.findUnique({ where: { email: parsed.email } });
    if (existing) {
      return apiError("A user with this email already exists.", 409);
    }

    const passwordHash = await hashPassword(parsed.password);
    const user = await db.user.create({
      data: {
        email: parsed.email,
        name: parsed.name,
        role: parsed.role,
        passwordHash,
      },
      select: userSelect,
    });

    await logAudit({ session, action: "create", entity: "User", entityId: user.id });

    return NextResponse.json({ data: user }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "create user");
  }
}
