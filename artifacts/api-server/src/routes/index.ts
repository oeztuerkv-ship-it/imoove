import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ridesRouter from "./rides";
import authRouter from "./auth";
import adminApiRouter from "./adminApi";
import panelAuthRouter from "./panelAuth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(panelAuthRouter);
router.use(adminApiRouter);
router.use(ridesRouter);

export default router;
