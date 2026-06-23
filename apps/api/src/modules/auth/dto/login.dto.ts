import { IsString, MinLength } from "class-validator";

export class LoginDto {
  // Demo mode: accept any identifier (username or email), not just a valid
  // email, so credentials like "demo" work. Looked up against User.email.
  @IsString()
  @MinLength(1)
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

