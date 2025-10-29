/*
  Warnings:

  - You are about to drop the column `attempts` on the `Wordle` table. All the data in the column will be lost.
  - Added the required column `score` to the `Wordle` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "discordId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT ''
);
INSERT INTO "new_User" ("discordId", "id", "username") SELECT "discordId", "id", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_discordId_key" ON "User"("discordId");
CREATE TABLE "new_Wordle" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL,
    "score" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,
    CONSTRAINT "Wordle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Wordle" ("createdAt", "date", "id", "userId") SELECT "createdAt", "date", "id", "userId" FROM "Wordle";
DROP TABLE "Wordle";
ALTER TABLE "new_Wordle" RENAME TO "Wordle";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
