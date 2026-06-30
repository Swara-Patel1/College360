from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from .models import User
from .serializers import (UserSerializer, RegisterSerializer,
                           LoginSerializer, ChangePasswordSerializer)


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
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
    """Admin dashboard statistics"""
    from students.models import Student
    from faculty.models import Faculty
    from courses.models import Course
    from fees.models import Fee
    stats = {
        'total_students': Student.objects.count(),
        'total_faculty': Faculty.objects.count(),
        'total_courses': Course.objects.count(),
        'total_fees_collected': sum(
            f.amount for f in Fee.objects.filter(status='paid')
        ),
        'total_fees_pending': sum(
            f.amount for f in Fee.objects.filter(status='pending')
        ),
        'total_users': User.objects.count(),
    }
    return Response(stats)
