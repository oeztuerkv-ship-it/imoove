import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ridesRouter from "./rides";
import authRouter from "./auth";
import adminApiRouter from "./adminApi";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(adminApiRouter);
router.use(ridesRouter);

export default router;
