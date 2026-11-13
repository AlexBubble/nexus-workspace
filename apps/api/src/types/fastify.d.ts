import "@fastify/jwt";

export interface JwtPayload {
  userId: string;
  email: string;
  type: "access" | "refresh";
  jti?: string;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}
