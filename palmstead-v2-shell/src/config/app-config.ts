import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "Palmstead",
  version: packageJson.version,
  copyright: `© ${currentYear}, Palmstead.`,
  meta: {
    title: "Palmstead",
    description: "Palmstead staff platform -- pipeline, operations, attendance, and reporting for the whole team.",
  },
};
