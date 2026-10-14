import { ArrowRight, ClipboardList, Headset, PackageSearch, ShieldCheck, ShoppingCart, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function Account() {
  const user = useAuth((state) => state.user);

  if (!user) return null;

  const shortcuts = user.role === "admin"
    ? [
        { label: "Manage products", description: "Update your product catalogue.", to: "/admin/products", icon: PackageSearch },
        { label: "Manage orders", description: "Review and fulfil customer orders.", to: "/admin/orders", icon: ClipboardList },
        { label: "Support inbox", description: "Respond to customer conversations.", to: "/support", icon: Headset },
      ]
    : [
        { label: "Your orders", description: "Check order status and delivery progress.", to: "/orders", icon: ClipboardList },
        { label: "Shopping cart", description: "Review items you’re ready to purchase.", to: "/cart", icon: ShoppingCart },
        { label: "Customer support", description: "Get help with an order or product.", to: "/support", icon: Headset },
      ];

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <p className="mb-1 text-xs font-semibold tracking-[0.16em] text-emerald-800">YOUR SHOPHUB</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
          Hello, {user.name.split(" ")[0]}
        </h1>
        <p className="mt-2 text-sm text-slate-600">Manage your account and find what you need.</p>
      </header>

      <section aria-labelledby="profile-heading" className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="account-profile-banner flex flex-wrap items-center gap-4 rounded-t-2xl bg-gradient-to-r from-emerald-950 to-emerald-900 px-5 py-6 text-white sm:px-7">
          <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-white/10 text-2xl font-semibold text-emerald-50">
            {user.name.trim().slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-100/75">Account profile</p>
            <h2 id="profile-heading" className="account-profile-name mt-1 truncate text-xl font-semibold">{user.name}</h2>
            <p className="account-profile-email mt-1 truncate text-sm">{user.email}</p>
          </div>
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${
            user.is_active ? "bg-white/10 text-emerald-50" : "bg-amber-100 text-amber-950"
          }`}>
            <span className={`h-2 w-2 rounded-full ${user.is_active ? "bg-emerald-300" : "bg-amber-600"}`} aria-hidden="true" />
            {user.is_active ? "Active account" : "Inactive account"}
          </span>
        </div>

        <div className="grid gap-px bg-stone-200 sm:grid-cols-2">
          <div className="bg-white p-5 sm:p-6">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <UserRound className="h-4 w-4 text-emerald-800" aria-hidden="true" /> Full name
            </div>
            <p className="mt-2 break-words font-medium text-slate-900">{user.name}</p>
          </div>
          <div className="bg-white p-5 sm:p-6">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <ShieldCheck className="h-4 w-4 text-emerald-800" aria-hidden="true" /> Account type
            </div>
            <p className="mt-2 capitalize font-medium text-slate-900">{user.role}</p>
          </div>
          <div className="bg-white p-5 sm:p-6 sm:col-span-2">
            <p className="text-sm font-medium text-slate-500">Email address</p>
            <p className="mt-2 break-all font-medium text-slate-900">{user.email}</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="shortcuts-heading" className="mt-9">
        <div className="mb-4">
          <h2 id="shortcuts-heading" className="text-xl font-semibold tracking-tight text-slate-950">
            {user.role === "admin" ? "Store management" : "Quick links"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {user.role === "admin" ? "Your frequently used store tools." : "Jump back into your shopping."}
          </p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shortcuts.map(({ label, description, to, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                className="group flex h-full items-start gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-800/40 hover:shadow-md focus-visible:outline-emerald-800"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-900">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-slate-900">{label}</span>
                  <span className="mt-1 block text-sm leading-5 text-slate-500">{description}</span>
                </span>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-emerald-800" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
