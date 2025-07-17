from fastapi import APIRouter, Query
from sqlmodel import Session, select
from app.core.db import engine
from app.models import TaxiOrder
from fastapi.responses import JSONResponse
from typing import List, Dict
from datetime import datetime
import math
from sqlalchemy import text

router = APIRouter(prefix="/analysis", tags=["analysis-congestion"])

def haversine(lat1, lon1, lat2, lon2):
    R = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c / 1000  # 返回公里

@router.get("/road-congestion-status")
def road_congestion_status(
    start_utc: str = Query(..., description="起始时间戳，格式YYYYMMDDHHMMSS"),
    end_utc: str = Query(..., description="结束时间戳，格式YYYYMMDDHHMMSS"),
):
    """
    统计每条路段的平均通行速度（基于订单），SQL聚合加速
    """
    try:
        sql = text("""
            SELECT
                ROUND(onlat::numeric, 3) AS onlat,
                ROUND(onlon::numeric, 3) AS onlon,
                ROUND(offlat::numeric, 3) AS offlat,
                ROUND(offlon::numeric, 3) AS offlon,
                AVG(distance / NULLIF(EXTRACT(EPOCH FROM (to_timestamp(offutc, 'YYYYMMDDHH24MISS') - to_timestamp(onutc, 'YYYYMMDDHH24MISS'))) / 3600, 0)) AS avg_speed,
                COUNT(*) AS count
            FROM taxiorder
            WHERE onutc >= :start_utc AND onutc <= :end_utc
              AND offutc IS NOT NULL AND distance IS NOT NULL
              AND onlat IS NOT NULL AND onlon IS NOT NULL
              AND offlat IS NOT NULL AND offlon IS NOT NULL
            GROUP BY
                ROUND(onlat::numeric, 3), ROUND(onlon::numeric, 3),
                ROUND(offlat::numeric, 3), ROUND(offlon::numeric, 3)
        """)
        with Session(engine) as session:
            rows = session.execute(sql, {"start_utc": start_utc, "end_utc": end_utc}).fetchall()
            result = []
            for row in rows:
                avg_speed = row.avg_speed if row.avg_speed else 0
                if avg_speed >= 40:
                    level = "畅通"
                elif avg_speed >= 20:
                    level = "一般"
                else:
                    level = "拥堵"
                result.append({
                    "onlat": float(row.onlat),
                    "onlon": float(row.onlon),
                    "offlat": float(row.offlat),
                    "offlon": float(row.offlon),
                    "avg_speed": round(avg_speed, 1),
                    "congestion_level": level,
                    "count": row.count
                })
            return {"roads": result}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"拥堵分析失败: {str(e)}"}) 