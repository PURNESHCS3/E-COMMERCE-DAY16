import { useAuth } from "../hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

export default function Account() {
  const user = useAuth((state) => state.user);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="mb-6 text-3xl font-bold">My Account</h1>
      <Card>
        <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div><span className="font-medium">Name:</span> {user.name}</div>
          <div><span className="font-medium">Email:</span> {user.email}</div>
          <div><span className="font-medium">Role:</span> {user.role}</div>
          <div><span className="font-medium">Account status:</span> {user.is_active ? "Active" : "Inactive"}</div>
        </CardContent>
      </Card>
    </div>
  );
}
