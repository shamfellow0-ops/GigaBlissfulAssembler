import { Router, type IRouter } from "express";
import healthRouter from "./health";
import itemIssuanceRouter from "./item-issuance";

const router: IRouter = Router();
router.use(healthRouter);
router.use(itemIssuanceRouter);
export default router;
