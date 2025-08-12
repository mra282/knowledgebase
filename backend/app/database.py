from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

# Get database URL from environment variable or use default
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/knowledgebase.db")

# Configure engine based on database type
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    # SQLite configuration for development
    db_path = SQLALCHEMY_DATABASE_URL.replace("sqlite:///", "")
    db_dir = os.path.dirname(db_path)
    if db_dir and not os.path.exists(db_dir):
        os.makedirs(db_dir, exist_ok=True)
    
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL, 
        connect_args={"check_same_thread": False},  # Needed for SQLite
        echo=False  # Set to True for SQL query logging during development
    )
else:
    # PostgreSQL configuration for Docker/production
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        echo=False,  # Set to True for SQL query logging during development
        pool_pre_ping=True,  # Enable connection health checks
        pool_recycle=300  # Recycle connections every 5 minutes
    )

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()

def get_db():
    """
    Dependency function to get database session.
    Used by FastAPI's dependency injection system.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def create_tables():
    """
    Create all database tables.
    Called at application startup.
    """
    from app.models import Base
    Base.metadata.create_all(bind=engine)
    # Ensure enums are up to date (especially for PostgreSQL)
    _ensure_postgres_enums()
    _ensure_article_notes_column()


def _ensure_postgres_enums():
    """Ensure PostgreSQL ENUM types contain all current values.

    Specifically handles the 'userrole' enum used by UserPermissions.role.
    Safe to call on SQLite (no-op) and on fresh databases.
    """
    try:
        if engine.dialect.name != "postgresql":
            return

        # Desired lowercase enum values
        desired_values = ["viewer", "editor", "moderator", "admin"]

        with engine.begin() as conn:
            # Ensure type exists
            type_exists = conn.execute(
                text(
                    "SELECT 1 FROM pg_type WHERE typname = :type_name"
                ),
                {"type_name": "userrole"},
            ).scalar() is not None

            if not type_exists:
                # Create enum type with all desired labels
                conn.execute(text("CREATE TYPE userrole AS ENUM ('viewer','editor','moderator','admin')"))

            # Read current labels
            result = conn.execute(
                text(
                    """
                    SELECT e.enumlabel
                    FROM pg_type t
                    JOIN pg_enum e ON t.oid = e.enumtypid
                    WHERE t.typname = :type_name
                    ORDER BY e.enumsortorder
                    """
                ),
                {"type_name": "userrole"},
            )
            existing = [row[0] for row in result]

            # Normalize any legacy uppercase labels by adding lowercase then migrating values
            legacy_upper = {lbl for lbl in existing if lbl.isupper()}
            for val in desired_values:
                if val not in existing:
                    conn.execute(text("ALTER TYPE userrole ADD VALUE :val"), {"val": val})

            # If table exists, normalize stored values to lowercase strings first (cast via text)
            table_exists = conn.execute(
                text(
                    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_permissions')"
                )
            ).scalar()
            if table_exists:
                # Update rows where role is uppercase to lowercase via text casting
                conn.execute(text("UPDATE user_permissions SET role = lower(role::text)::userrole WHERE role::text != lower(role::text)"))
    except Exception as e:
        # Don't block startup; just log to stdout
        print(f"Warning: failed to ensure PostgreSQL enums: {e}")

def _ensure_article_notes_column():
    """Add 'notes' column to 'articles' if missing (SQLite/PostgreSQL).

    This is a lightweight migration helper to avoid Alembic for this small change.
    """
    try:
        with engine.begin() as conn:
            if engine.dialect.name == "sqlite":
                rows = conn.exec_driver_sql("PRAGMA table_info(articles)").fetchall()
                cols = {r[1] for r in rows}
                if "notes" not in cols:
                    conn.exec_driver_sql("ALTER TABLE articles ADD COLUMN notes TEXT")
            elif engine.dialect.name == "postgresql":
                exists = conn.execute(
                    text(
                        """
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'articles' AND column_name = 'notes'
                        """
                    )
                ).scalar()
                if not exists:
                    conn.execute(text("ALTER TABLE articles ADD COLUMN notes TEXT"))
    except Exception as e:
        print(f"Warning: failed to ensure 'notes' column: {e}")

def seed_sample_data():
    """
    Add some sample public articles for demonstration.
    Only adds if no articles exist.
    """
    db = SessionLocal()
    try:
        from app.models import Article
        
        # Check if articles already exist
        existing_count = db.query(Article).count()
        if existing_count > 0:
            return
        
        # Create sample articles about North American trains
        sample_articles = [
            # Public Articles (8)
            Article(
                title="Introduction to North American Passenger Rail",
                content="North American passenger rail includes Amtrak in the United States, VIA Rail in Canada, and various regional systems. Amtrak operates long-distance routes like the California Zephyr (Chicago to San Francisco), Empire Builder (Chicago to Seattle/Portland), and the Coast Starlight (Seattle to Los Angeles). VIA Rail's flagship route is The Canadian (Toronto to Vancouver). Most routes use diesel locomotives, though the Northeast Corridor uses electric power for high-speed Acela service.",
                tags=["amtrak", "via-rail", "passenger-rail", "routes", "introduction"],
                weight_score=8.5,
                is_public=True,
                view_count=245,
                helpful_votes=198
            ),
            Article(
                title="Understanding Train Classifications and Equipment",
                content="North American trains are classified by service type: passenger (Amtrak, VIA Rail, commuter), freight (BNSF, Union Pacific, CSX, Norfolk Southern, Canadian National, Canadian Pacific), and industrial/switching. Locomotive types include diesel-electric (most common), electric (Northeast Corridor), and steam (heritage/tourist). Passenger cars include coaches, sleepers, dining cars, and observation cars. Freight cars include boxcars, tankers, flatcars, hoppers, and intermodal containers.",
                tags=["locomotives", "rolling-stock", "passenger-cars", "freight-cars", "classifications"],
                weight_score=7.8,
                is_public=True,
                view_count=189,
                helpful_votes=156
            ),
            Article(
                title="Major North American Rail Routes and Corridors",
                content="Key passenger corridors include the Northeast Corridor (Boston-NYC-Philadelphia-Washington), California corridors (San Francisco-Los Angeles), and transcontinental routes. The Canadian crosses the entire continent through the Canadian Rockies. Freight corridors follow major trade routes: BNSF's southern transcon, UP's Overland Route, and the Canadian mainlines. Important junctions include Chicago (rail hub), Kansas City, and Winnipeg. Many routes follow historical paths established in the 1800s.",
                tags=["routes", "corridors", "northeast-corridor", "transcontinental", "chicago", "geography"],
                weight_score=8.2,
                is_public=True,
                view_count=312,
                helpful_votes=278
            ),
            Article(
                title="Train Travel Tips and Booking Guide",
                content="Book Amtrak and VIA Rail tickets online or through apps. Sleeper accommodations include roomettes, bedrooms, and accessible rooms. Coach seats are comfortable but bring pillows for overnight journeys. Dining cars serve full meals on long-distance trains. Pack light as luggage space is limited. Arrive 30 minutes early for departure. Business and First Class offer more space and amenities. Consider rail passes for multiple trips. Check for delays on social media or apps before departure.",
                tags=["travel-tips", "booking", "sleeper-cars", "dining", "luggage", "customer-service"],
                weight_score=6.9,
                is_public=True,
                view_count=156,
                helpful_votes=142
            ),
            Article(
                title="Steam Locomotives and Heritage Railways",
                content="Steam locomotives were the backbone of North American railroads until diesel took over in the 1950s. Famous steam engines include Union Pacific's Big Boy (4-8-8-4), Pennsylvania Railroad's GG1, and Canadian Pacific's Royal Hudson. Many heritage railways operate steam trains for tourists: Cumbres & Toltec (Colorado/New Mexico), Grand Canyon Railway (Arizona), and Kettle Valley Steam Railway (British Columbia). Steam requires coal/oil, water, and extensive maintenance compared to modern diesel power.",
                tags=["steam-locomotives", "heritage-railways", "big-boy", "tourism", "history", "maintenance"],
                weight_score=7.5,
                is_public=True,
                view_count=203,
                helpful_votes=187
            ),
            Article(
                title="Freight Railroad Operations and Logistics",
                content="North American freight railroads move coal, grain, intermodal containers, automobiles, and chemicals. Unit trains carry single commodities like coal or grain. Intermodal service competes with trucking for containerized freight. Dispatchers coordinate train movements through centralized traffic control (CTC). Crew changes occur at division points approximately every 12 hours. Modern freight trains can exceed 100 cars and 2 miles in length, requiring distributed power (additional locomotives mid-train).",
                tags=["freight", "logistics", "intermodal", "unit-trains", "dispatching", "operations"],
                weight_score=8.7,
                is_public=True,
                view_count=178,
                helpful_votes=164
            ),
            Article(
                title="Railroad Safety and Signaling Systems",
                content="North American railroads use Automatic Block Signaling (ABS) with red, yellow, and green aspects. Positive Train Control (PTC) prevents collisions and overspeed conditions. Grade crossings use gates, lights, and bells to warn motorists. Railroad workers wear high-visibility clothing and follow Federal Railroad Administration (FRA) safety regulations. Emergency procedures include radio protocols and emergency brake applications. Passenger trains have additional safety systems including crash energy management and emergency evacuation procedures.",
                tags=["safety", "signaling", "ptc", "grade-crossings", "fra-regulations", "emergency-procedures"],
                weight_score=9.1,
                is_public=True,
                view_count=267,
                helpful_votes=251
            ),
            Article(
                title="Commuter and Regional Rail Systems",
                content="Major North American commuter systems include LIRR/Metro-North (New York), Metra (Chicago), Caltrain (San Francisco Bay Area), Metrolink (Los Angeles), and GO Transit (Toronto). These systems typically use bi-level cars and diesel or electric multiple units. Service patterns include express and local stops. Fare systems often use zones or distance-based pricing. Many systems connect to subway/metro networks at major terminals. Rush hour service is frequent, with reduced schedules on weekends.",
                tags=["commuter-rail", "regional-rail", "metra", "caltrain", "go-transit", "fare-systems"],
                weight_score=6.8,
                is_public=True,
                view_count=134,
                helpful_votes=119
            ),
            
            # Private Articles (4) - Internal railroad operations and sensitive information
            Article(
                title="Railroad Employee Timetables and Operating Rules",
                content="INTERNAL USE ONLY - Employee timetables contain track speeds, station stops, and operating instructions. General Code of Operating Rules (GCOR) governs train operations across most western railroads. Form D track warrants authorize train movement on dark territory. Dispatcher must copy all mandatory directives verbatim. Speed restrictions are communicated through track bulletins and updated daily. Crew members must qualify on physical characteristics of their territory annually.",
                tags=["timetables", "gcor", "dispatching", "track-warrants", "operating-rules", "internal"],
                weight_score=8.9,
                is_public=False,
                view_count=89,
                helpful_votes=81
            ),
            Article(
                title="Locomotive Maintenance Schedules and Procedures",
                content="CONFIDENTIAL - Locomotive maintenance follows FRA Part 229 requirements. Daily inspections include brake tests, engine fluids, and safety devices. 92-day inspections require detailed mechanical examination. Annual inspections rebuild major components. Predictive maintenance uses sensors to monitor engine performance, wheel wear, and brake condition. Maintenance facilities stock critical spare parts based on locomotive age and utilization patterns. Failed locomotives are tagged out of service until repairs are completed.",
                tags=["maintenance", "fra-part-229", "inspections", "predictive-maintenance", "locomotives", "confidential"],
                weight_score=9.3,
                is_public=False,
                view_count=67,
                helpful_votes=62
            ),
            Article(
                title="Emergency Response and Incident Management",
                content="RESTRICTED - Emergency response procedures for derailments, hazmat spills, and grade crossing accidents. First responder contact list includes police, fire, EMS, and railroad police. Hazmat response requires specialized equipment and trained personnel. Derailment response includes securing the area, protecting other tracks, and coordinating with contractors. All incidents require immediate notification to FRA within regulatory timeframes. Investigation teams document evidence and interview crew members.",
                tags=["emergency-response", "derailments", "hazmat", "incident-management", "fra-reporting", "restricted"],
                weight_score=9.7,
                is_public=False,
                view_count=156,
                helpful_votes=148
            ),
            Article(
                title="Railroad Financial Performance and Strategic Planning",
                content="INTERNAL - Railroad financial metrics include operating ratio, revenue per car, and fuel efficiency. Intermodal growth drives profitability while coal traffic declines. Capital investments focus on infrastructure, locomotive upgrades, and technology systems. Labor negotiations affect operational costs and service reliability. Regulatory compliance costs include PTC implementation and environmental requirements. Strategic partnerships with trucking companies expand market reach.",
                tags=["financial-performance", "operating-metrics", "strategic-planning", "intermodal", "capital-investments", "internal"],
                weight_score=7.4,
                is_public=False,
                view_count=43,
                helpful_votes=38
            )
        ]
        
        for article in sample_articles:
            db.add(article)
        
        db.commit()
        print("✅ Sample articles created successfully")
        
    except Exception as e:
        print(f"Error creating sample data: {e}")
        db.rollback()
    finally:
        db.close()
