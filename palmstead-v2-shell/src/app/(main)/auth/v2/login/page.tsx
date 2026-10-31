import { redirect } from "next/navigation";

export default function LoginV2() {
  redirect("/auth/v1/login");
}
