// Lets Blink clients map our human-facing deal pages to the Action API.
const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

export const GET = () =>
  new Response(
    JSON.stringify({
      rules: [
        { pathPattern: "/deal/*", apiPath: "/api/actions/deal/*" },
        { pathPattern: "/api/actions/**", apiPath: "/api/actions/**" },
      ],
    }),
    { headers: HEADERS }
  );

export const OPTIONS = () => new Response(null, { headers: HEADERS });
