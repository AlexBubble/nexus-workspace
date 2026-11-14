import { z } from "zod";

// 1. Роли пользователя в системе (строгий Enum)
export const UserRoleSchema = z.enum(["OWNER", "ADMIN", "MEMBER", "GUEST"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

// 2. Схема пользователя (проверка в рантайме + автоматический тип)
export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email("Некорректный формат email"),
  fullName: z.string().min(2, "Имя должно содержать минимум 2 символа").max(100),
  avatarUrl: z.string().url().nullable(),
  role: UserRoleSchema,
  createdAt: z.coerce.date(),
});

// Выводим чистый TypeScript-тип прямо из Zod-схемы
export type User = z.infer<typeof UserSchema>;

// 3. Схема создания рабочего пространства (DTO — Data Transfer Object)
export const CreateWorkspaceSchema = z.object({
  name: z.string().min(3, "Название команды должно быть не короче 3 символов").max(50),
  slug: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-z0-9-]+$/, "Slug может содержать только строчные латинские буквы, цифры и дефис"),
});

export type CreateWorkspaceDto = z.infer<typeof CreateWorkspaceSchema>;

// 4. Схемы для Аутентификации (Регистрация и Вход)
export const RegisterSchema = z.object({
  email: z.string().email("Некорректный формат email"),
  password: z
    .string()
    .min(8, "Пароль должен содержать минимум 8 символов")
    .max(100, "Пароль слишком длинный"),
  fullName: z.string().min(2, "Имя должно содержать минимум 2 символа").max(100),
});

export type RegisterDto = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z.string().email("Некорректный формат email"),
  password: z.string().min(1, "Введите пароль"),
});

export type LoginDto = z.infer<typeof LoginSchema>;

// 5. Схема создания канала внутри рабочего пространства
export const CreateChannelSchema = z.object({
  name: z
    .string()
    .min(2, "Название канала должно быть не короче 2 символов")
    .max(30, "Название канала слишком длинное")
    .regex(/^[a-z0-9-]+$/, "Только строчные латинские буквы, цифры и дефис"),
  isPrivate: z.boolean().optional().default(false),
});

export type CreateChannelDto = z.infer<typeof CreateChannelSchema>;
