# Graph Report - .  (2026-07-03)

## Corpus Check
- 140 files · ~71,856 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1047 nodes · 2576 edges · 93 communities (72 shown, 21 thin omitted)
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 326 edges (avg confidence: 0.58)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Chart Data Processing Engine|Chart Data Processing Engine]]
- [[_COMMUNITY_Chart Rendering & Event Loops|Chart Rendering & Event Loops]]
- [[_COMMUNITY_Chart Core Constructor & Modules|Chart Core Constructor & Modules]]
- [[_COMMUNITY_Frontend Socket & Chart Libraries|Frontend Socket & Chart Libraries]]
- [[_COMMUNITY_Chart Canvas Rendering Contexts|Chart Canvas Rendering Contexts]]
- [[_COMMUNITY_Chart Color Parsing & Utilities|Chart Color Parsing & Utilities]]
- [[_COMMUNITY_Chart Scale Tick Calculations|Chart Scale Tick Calculations]]
- [[_COMMUNITY_Chart Time Layout Generators|Chart Time Layout Generators]]
- [[_COMMUNITY_Attendance Records Backend Module|Attendance Records Backend Module]]
- [[_COMMUNITY_Chart Axis Padding Computations|Chart Axis Padding Computations]]
- [[_COMMUNITY_User Accounts & Authentication Backend|User Accounts & Authentication Backend]]
- [[_COMMUNITY_Chart Path Animation Segment Interpolator|Chart Path Animation Segment Interpolator]]
- [[_COMMUNITY_Class Timetable Backend Module|Class Timetable Backend Module]]
- [[_COMMUNITY_Chart Coordinate Mappings|Chart Coordinate Mappings]]
- [[_COMMUNITY_Chart Grid Rendering Submodules|Chart Grid Rendering Submodules]]
- [[_COMMUNITY_Chart Box Positioning Helpers|Chart Box Positioning Helpers]]
- [[_COMMUNITY_Django Backend Application Configurations|Django Backend Application Configurations]]
- [[_COMMUNITY_Chart Drawing Styles Helper|Chart Drawing Styles Helper]]
- [[_COMMUNITY_Chart Arc & Circle Element Visualizers|Chart Arc & Circle Element Visualizers]]
- [[_COMMUNITY_Chart Font Layout Utilities|Chart Font Layout Utilities]]
- [[_COMMUNITY_Faculty & Department Directory Module|Faculty & Department Directory Module]]
- [[_COMMUNITY_Academic Grades & Marks Module|Academic Grades & Marks Module]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Student Grievance & Complaints Module|Student Grievance & Complaints Module]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Realtime WebSocket Server Package Spec|Realtime WebSocket Server Package Spec]]
- [[_COMMUNITY_Fee Structure & Payments Backend Module|Fee Structure & Payments Backend Module]]
- [[_COMMUNITY_Notices & Announcements Module|Notices & Announcements Module]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Student Profile Management Backend|Student Profile Management Backend]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Realtime Socket.io Message Server|Realtime Socket.io Message Server]]
- [[_COMMUNITY_Frontend App Services Adapter|Frontend App Services Adapter]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Django CLI Project Management|Django CLI Project Management]]
- [[_COMMUNITY_Supabase DB Core Adapter Client|Supabase DB Core Adapter Client]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]

## God Nodes (most connected - your core abstractions)
1. `tn` - 125 edges
2. `n()` - 75 edges
3. `s()` - 47 edges
4. `o()` - 42 edges
5. `a()` - 42 edges
6. `r()` - 32 edges
7. `l()` - 32 edges
8. `d()` - 30 edges
9. `ho()` - 30 edges
10. `i()` - 30 edges

## Surprising Connections (you probably didn't know these)
- `Meta` --uses--> `User`  [INFERRED]
  backend/notices/models.py → backend/accounts/models.py
- `UserAdmin` --uses--> `User`  [INFERRED]
  backend/accounts/admin.py → backend/accounts/models.py
- `Meta` --uses--> `User`  [INFERRED]
  backend/accounts/serializers.py → backend/accounts/models.py
- `Department` --uses--> `User`  [INFERRED]
  backend/faculty/models.py → backend/accounts/models.py
- `Faculty` --uses--> `User`  [INFERRED]
  backend/faculty/models.py → backend/accounts/models.py

## Import Cycles
- None detected.

## Communities (93 total, 21 thin omitted)

### Community 0 - "Chart Data Processing Engine"
Cohesion: 0.06
Nodes (36): a(), Ae(), ai(), dataset(), determineDataLimits(), draw(), fa(), Fi() (+28 more)

### Community 1 - "Chart Rendering & Event Loops"
Cohesion: 0.08
Nodes (14): afterDraw(), afterEvent(), afterUpdate(), Ba(), ki(), Oi(), po(), Si() (+6 more)

### Community 2 - "Chart Core Constructor & Modules"
Cohesion: 0.05
Nodes (13): Bi(), cn(), fo(), gi(), hn(), K(), labelColor(), labelPointStyle() (+5 more)

### Community 3 - "Frontend Socket & Chart Libraries"
Cohesion: 0.08
Nodes (44): _(), _(), b(), eo(), et(), f(), g(), H() (+36 more)

### Community 4 - "Chart Canvas Rendering Contexts"
Cohesion: 0.05
Nodes (14): Be(), Ci(), cs, ei(), en, je(), ne(), numeric() (+6 more)

### Community 5 - "Chart Color Parsing & Utilities"
Cohesion: 0.06
Nodes (17): Bt(), color(), Ee(), Ft(), Gt(), It(), jt(), kt() (+9 more)

### Community 6 - "Chart Scale Tick Calculations"
Cohesion: 0.08
Nodes (17): ao(), average(), bo, co(), Do(), getCenterPoint(), inXRange(), inYRange() (+9 more)

### Community 7 - "Chart Time Layout Generators"
Cohesion: 0.08
Nodes (15): beforeLayout(), buildLookupTable(), _generate(), getDecimalForValue(), _getTimestampsForTable(), getValueForPixel(), Go(), ho() (+7 more)

### Community 8 - "Attendance Records Backend Module"
Cohesion: 0.13
Nodes (13): AttendanceRecord, Meta, AttendanceSerializer, Meta, AttendanceViewSet, Course, Enrollment, Meta (+5 more)

### Community 10 - "User Accounts & Authentication Backend"
Cohesion: 0.13
Nodes (15): AbstractUser, UserAdmin, User, ChangePasswordSerializer, LoginSerializer, Meta, RegisterSerializer, UserSerializer (+7 more)

### Community 11 - "Chart Path Animation Segment Interpolator"
Cohesion: 0.10
Nodes (21): beforeDatasetDraw(), beforeDatasetsDraw(), beforeDraw(), ca, da(), ea(), ga(), getBasePixel() (+13 more)

### Community 12 - "Class Timetable Backend Module"
Cohesion: 0.14
Nodes (9): Schedule, Meta, ScheduleSerializer, IsHODOrAdmin, Custom permission: only HOD (designation=hod) or admin role can write., Returns schedules assigned to the currently logged-in faculty., Utility to verify write access., ScheduleViewSet (+1 more)

### Community 13 - "Chart Coordinate Mappings"
Cohesion: 0.15
Nodes (17): aa(), Bn(), _calculateBarIndexPixels(), _calculateBarValuePixels(), _getAxis(), _getAxisCount(), getFirstScaleIdForIndexAxis(), getLabelAndValue() (+9 more)

### Community 15 - "Chart Box Positioning Helpers"
Cohesion: 0.16
Nodes (4): an(), as(), on, ts()

### Community 16 - "Django Backend Application Configurations"
Cohesion: 0.10
Nodes (11): AppConfig, AccountsConfig, AttendanceConfig, ComplaintsConfig, CoursesConfig, FacultyConfig, FeesConfig, GradesConfig (+3 more)

### Community 17 - "Chart Drawing Styles Helper"
Cohesion: 0.11
Nodes (12): bs(), ct(), es(), ge(), generateLabels(), is(), ks(), ms() (+4 more)

### Community 18 - "Chart Arc & Circle Element Visualizers"
Cohesion: 0.13
Nodes (7): buildTicks(), mo(), parse(), parseArrayData(), parsePrimitiveData(), resolveDataElementOptions(), Vn()

### Community 20 - "Faculty & Department Directory Module"
Cohesion: 0.28
Nodes (9): DepartmentAdmin, FacultyAdmin, Department, Faculty, DepartmentSerializer, FacultySerializer, Meta, DepartmentViewSet (+1 more)

### Community 21 - "Academic Grades & Marks Module"
Cohesion: 0.18
Nodes (7): Grade, Meta, GradeSerializer, Meta, GradeViewSet, Returns grades for the currently logged-in student., Seed script to populate the database with sample data. Run with: python manage.p

### Community 22 - "Community 22"
Cohesion: 0.12
Nodes (7): addBox(), configure(), kn(), ln(), qn(), start(), un()

### Community 23 - "Community 23"
Cohesion: 0.13
Nodes (4): Ie(), Us(), Y(), Ys()

### Community 24 - "Student Grievance & Complaints Module"
Cohesion: 0.21
Nodes (6): Complaint, Meta, ComplaintSerializer, Meta, ComplaintViewSet, HOD/Admin responds to a complaint.

### Community 25 - "Community 25"
Cohesion: 0.15
Nodes (10): at(), dn(), e(), fe(), getMaxOverflow(), Ls(), ps(), removeBox() (+2 more)

### Community 26 - "Community 26"
Cohesion: 0.15
Nodes (4): beforeUpdate(), initialize(), reset(), rt()

### Community 27 - "Realtime WebSocket Server Package Spec"
Cohesion: 0.15
Nodes (12): dependencies, cors, express, jsonwebtoken, socket.io, description, main, name (+4 more)

### Community 28 - "Fee Structure & Payments Backend Module"
Cohesion: 0.32
Nodes (4): Fee, FeeSerializer, Meta, FeeViewSet

### Community 29 - "Notices & Announcements Module"
Cohesion: 0.30
Nodes (5): Meta, Notice, Meta, NoticeSerializer, NoticeViewSet

### Community 31 - "Student Profile Management Backend"
Cohesion: 0.36
Nodes (4): Student, Meta, StudentSerializer, StudentViewSet

### Community 33 - "Realtime Socket.io Message Server"
Cohesion: 0.18
Nodes (10): app, chatMessages, connectedUsers, cors, express, http, io, jwt (+2 more)

### Community 34 - "Frontend App Services Adapter"
Cohesion: 0.22
Nodes (8): API, Auth, buildGlobalSidebar(), generateNavItems(), Modal, SupaFetch, Toast, Utils

### Community 36 - "Community 36"
Cohesion: 0.33
Nodes (3): ce(), de, he()

### Community 37 - "Community 37"
Cohesion: 0.20
Nodes (8): Fs(), getPixelForTick(), Gs(), lt(), vs(), ws(), zn(), zs()

### Community 38 - "Community 38"
Cohesion: 0.28
Nodes (3): dt(), ke(), Pn()

## Knowledge Gaps
- **42 isolated node(s):** `Migration`, `Migration`, `Meta`, `Migration`, `Meta` (+37 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `tn` connect `Chart Axis Padding Computations` to `Chart Data Processing Engine`, `Chart Rendering & Event Loops`, `Chart Core Constructor & Modules`, `Frontend Socket & Chart Libraries`, `Chart Canvas Rendering Contexts`, `Chart Scale Tick Calculations`, `Chart Time Layout Generators`, `Chart Path Animation Segment Interpolator`, `Chart Coordinate Mappings`, `Chart Grid Rendering Submodules`, `Chart Drawing Styles Helper`, `Chart Arc & Circle Element Visualizers`, `Chart Font Layout Utilities`, `Community 22`, `Community 23`, `Community 25`, `Community 30`, `Community 32`, `Community 35`, `Community 37`, `Community 38`, `Community 40`?**
  _High betweenness centrality (0.105) - this node is a cross-community bridge._
- **Why does `n()` connect `Chart Data Processing Engine` to `Chart Rendering & Event Loops`, `Chart Core Constructor & Modules`, `Frontend Socket & Chart Libraries`, `Chart Canvas Rendering Contexts`, `Chart Color Parsing & Utilities`, `Chart Scale Tick Calculations`, `Chart Time Layout Generators`, `Chart Axis Padding Computations`, `Chart Path Animation Segment Interpolator`, `Chart Box Positioning Helpers`, `Chart Drawing Styles Helper`, `Chart Arc & Circle Element Visualizers`, `Community 22`, `Community 23`, `Community 25`, `Community 30`, `Community 35`, `Community 37`, `Community 38`, `Community 40`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Why does `hs` connect `Community 39` to `Chart Core Constructor & Modules`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Are the 19 inferred relationships involving `n()` (e.g. with `_()` and `ai()`) actually correct?**
  _`n()` has 19 INFERRED edges - model-reasoned connections that need verification._
- **Are the 20 inferred relationships involving `s()` (e.g. with `_()` and `beforeUpdate()`) actually correct?**
  _`s()` has 20 INFERRED edges - model-reasoned connections that need verification._
- **Are the 14 inferred relationships involving `o()` (e.g. with `ai()` and `draw()`) actually correct?**
  _`o()` has 14 INFERRED edges - model-reasoned connections that need verification._
- **Are the 21 inferred relationships involving `a()` (e.g. with `ai()` and `.buildTicks()`) actually correct?**
  _`a()` has 21 INFERRED edges - model-reasoned connections that need verification._