import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ridesRouter from "./rides";
import authRouter from "./auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(ridesRouter);

export default router;
