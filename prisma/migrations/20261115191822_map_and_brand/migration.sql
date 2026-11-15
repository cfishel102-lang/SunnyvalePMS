-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "brand" JSONB;

-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "accessible" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "lengthFt" DROP NOT NULL;

-- AlterTable
ALTER TABLE "SiteClass" ADD COLUMN     "color" TEXT NOT NULL DEFAULT '#636F56';

-- CreateTable
CREATE TABLE "PropertyMap" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "analysis" JSONB,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PropertyMap_propertyId_key" ON "PropertyMap"("propertyId");

-- AddForeignKey
ALTER TABLE "PropertyMap" ADD CONSTRAINT "PropertyMap_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
