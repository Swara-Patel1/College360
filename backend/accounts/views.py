from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from .models import User
from .serializers import (UserSerializer, RegisterSerializer,
                           LoginSerializer, ChangePasswordSerializer)


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    """
    Login with email + password. Returns access token, refresh token, and user object.
    Matches the shape expected by the React frontend's client.js.
    """
    serializer = LoginSerializer(data=request.data)
    if serializer.is_valid():
        return Response(serializer.validated_data, status=status.HTTP_200_OK)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])
def register_view(request):
    serializer = RegisterSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()
        refresh = RefreshToken.for_user(user)
        return Response({
            'user': UserSerializer(user).data,
            'access': str(refresh.access_token),
            'refresh': str(refresh),
        }, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET', 'PUT', 'PATCH'])
@permission_classes([IsAuthenticated])
def profile_view(request):
    if request.method == 'GET':
        return Response(UserSerializer(request.user).data)
    serializer = UserSerializer(request.user, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def upload_avatar_view(request):
    """
    Upload student / user profile picture.
    Handles multipart/form-data image uploads.
    """
    file_obj = request.FILES.get('profile_pic') or request.FILES.get('avatar')
    if not file_obj:
        return Response({'error': 'No profile picture file provided.'}, status=status.HTTP_400_BAD_REQUEST)

    user = request.user
    user.profile_pic = file_obj
    user.save()

    return Response({
        'success': True,
        'message': 'Profile picture uploaded successfully.',
        'profile_pic_url': request.build_absolute_uri(user.profile_pic.url) if user.profile_pic else None,
        'user': UserSerializer(user).data
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password_view(request):
    serializer = ChangePasswordSerializer(data=request.data, context={'request': request})
    if serializer.is_valid():
        serializer.save()
        return Response({'message': 'Password changed successfully.'})
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def users_list(request):
    if request.user.role != 'admin':
        return Response({'error': 'Permission denied'}, status=403)
    role = request.query_params.get('role', None)
    users = User.objects.all()
    if role:
        users = users.filter(role=role)
    return Response(UserSerializer(users, many=True).data)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def delete_user(request, pk):
    if request.user.role != 'admin':
        return Response({'error': 'Permission denied'}, status=403)
    try:
        user = User.objects.get(pk=pk)
        user.delete()
        return Response({'message': 'User deleted.'})
    except User.DoesNotExist:
        return Response({'error': 'Not found'}, status=404)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_stats(request):
    """Admin dashboard statistics — matches frontend client.js expected shape."""
    from students.models import Student
    from faculty.models import Faculty, Department
    from courses.models import Course
    from fees.models import Fee

    total_fees_collected = sum(
        float(f.amount) for f in Fee.objects.filter(status='paid')
    )
    total_fees_pending = sum(
        float(f.amount) for f in Fee.objects.filter(status__in=['pending', 'overdue'])
    )
    paid_student_ids = set(
        Fee.objects.filter(status='paid').values_list('student_id', flat=True)
    )
    all_student_count = Student.objects.count()
    fees_pending_students = Student.objects.exclude(id__in=paid_student_ids).count()

    active_users = User.objects.filter(is_active=True).count()
    inactive_users = User.objects.filter(is_active=False).count()

    return Response({
        'total_students': all_student_count,
        'total_faculty': Faculty.objects.count(),
        'total_courses': Course.objects.count(),
        'total_departments': Department.objects.count(),
        'total_fees_collected': total_fees_collected,
        'total_fees_pending': total_fees_pending,
        'fees_pending_students': fees_pending_students,
        'active_users': active_users,
        'inactive_users': inactive_users,
        'total_hod': User.objects.filter(role='admin').count(),
        'total_users': User.objects.count(),
    })
