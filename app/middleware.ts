import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isArvoRoute = createRouteMatcher(["/arvo(.*)"]);
const isPublicArvoRoute = createRouteMatcher([
  "/arvo/sign-in(.*)",
  "/arvo/sign-up(.*)",
  "/arvo/api/stripe/webhook",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isArvoRoute(req) && !isPublicArvoRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
