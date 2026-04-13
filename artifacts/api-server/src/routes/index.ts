import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ridesRouter from "./rides";
import authRouter from "./auth";
import adminApiRouter from "./adminApi";
import panelAuthRouter from "./panelAuth";
import panelApiRouter from "./panelApi";
import fleetAuthRouter from "./fleetAuth";
import fleetDriverApiRouter from "./fleetDriverApi";
import fleetPanelApiRouter from "./fleetPanelApi";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(panelAuthRouter);
router.use(fleetAuthRouter);
router.use(fleetDriverApiRouter);
router.use(fleetPanelApiRouter);
router.use(panelApiRouter);
router.use(adminApiRouter);
router.use(ridesRouter);

export default router;
