type LogLevel = "INFO" | "WARN" | "ERROR";

function write(level: LogLevel, component: string, message: string): void {
  const line = `[${new Date().toISOString()}] [${level}] [${component}] ${message}`;
  if (level === "ERROR") {
    console.error(line);
    return;
  }
  console.log(line);
}

export const logger = {
  info(component: string, message: string): void {
    write("INFO", component, message);
  },

  warn(component: string, message: string): void {
    write("WARN", component, message);
  },

  error(component: string, message: string): void {
    write("ERROR", component, message);
  },
};
